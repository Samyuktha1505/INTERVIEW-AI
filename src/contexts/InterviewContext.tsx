import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '../contexts/AuthContext';
import { analyzeResume } from '../services/resumeAnalysis';
import { apiRequest } from '../services/interviewService';

export interface Room {
  id: string;
  userId?: string;
  targetRole: string;
  targetCompany: string;
  interviewType: string;
  yearsOfExperience: string;
  currentDesignation: string;
  sessionInterval?: number;
  createdAt: string;
  hasCompletedInterview?: boolean;
  transcript?: string | null;
  metrics?: any;
  status?: string;
}

interface InterviewContextType {
  rooms: Room[];
  loading: boolean;
  error: string | null;
  isCreatingRoom: boolean;
  createRoom: (
    roomData: Omit<
      Room,
      | 'id'
      | 'createdAt'
      | 'hasCompletedInterview'
      | 'transcript'
      | 'metrics'
    >
  ) => Promise<string>;
  getRoom: (roomId: string) => Room | undefined;
  deleteRoom: (roomId: string) => Promise<void>;
  markRoomAsCompleted: (roomId: string) => Promise<void>;
  updateRoom: (
    roomId: string,
    updates: Partial<Omit<Room, 'id'>>
  ) => Promise<void>;
  getCompletedRooms: () => Room[];
  getPendingRooms: () => Room[];
  clearError: () => void;
  refetchRooms: () => Promise<void>; // ✅ Added
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

const normalizeString = (str: string | undefined): string => {
  return str ? str.trim().toLowerCase().replace(/\s+/g, ' ') : '';
};

const generateRoomKey = (roomData: Partial<Room>, userId?: string): string => {
  return JSON.stringify({
    userId,
    targetRole: normalizeString(roomData.targetRole),
    targetCompany: normalizeString(roomData.targetCompany),
    interviewType: normalizeString(roomData.interviewType),
    yearsOfExperience: normalizeString(roomData.yearsOfExperience),
    currentDesignation: normalizeString(roomData.currentDesignation),
    sessionInterval: roomData.sessionInterval,
  });
};

export const InterviewProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const { user, isLoading: authLoading } = useAuth();
  const pendingCreates = useRef<Set<string>>(new Set());

  const fetchRooms = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ sessions: Room[] }>({
        endpoint: '/api/v1/sessions/',
        method: 'GET',
      });

      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      setRooms(sessions);
    } catch {
      setRooms([]);
      setError('Failed to fetch rooms. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchRooms();
    }
  }, [user, authLoading, fetchRooms]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createRoom = async (
    roomData: Omit<
      Room,
      | 'id'
      | 'createdAt'
      | 'hasCompletedInterview'
      | 'transcript'
      | 'metrics'
    >
  ): Promise<string> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const normalizedRoomData = {
      ...roomData,
      targetRole: normalizeString(roomData.targetRole),
      targetCompany: normalizeString(roomData.targetCompany),
      interviewType: normalizeString(roomData.interviewType),
      yearsOfExperience: normalizeString(roomData.yearsOfExperience),
      currentDesignation: normalizeString(roomData.currentDesignation),
    };

    const duplicateRoom = rooms.find((room) => {
      return (
        normalizeString(room.targetRole) === normalizedRoomData.targetRole &&
        normalizeString(room.targetCompany) === normalizedRoomData.targetCompany &&
        normalizeString(room.interviewType) === normalizedRoomData.interviewType &&
        normalizeString(room.yearsOfExperience) === normalizedRoomData.yearsOfExperience &&
        normalizeString(room.currentDesignation) === normalizedRoomData.currentDesignation &&
        room.sessionInterval === normalizedRoomData.sessionInterval &&
        room.userId === user.id &&
        room.status !== 'deleted'
      );
    });

    if (duplicateRoom) {
      const errorMessage = `You already have a room for ${roomData.targetRole} at ${roomData.targetCompany} with the same configuration.`;
      setError(errorMessage);
      throw new Error(errorMessage);
    }

    const createKey = generateRoomKey(roomData, user.id);

    if (pendingCreates.current.has(createKey)) {
      const errorMessage = 'Room creation already in progress for this configuration.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }

    pendingCreates.current.add(createKey);
    setIsCreatingRoom(true);
    setError(null);

    try {
      const analysisPayload = {
        targetRole: normalizedRoomData.targetRole,
        targetCompany: normalizedRoomData.targetCompany,
        yearsOfExperience: normalizedRoomData.yearsOfExperience,
        currentDesignation: normalizedRoomData.currentDesignation,
        interviewType: normalizedRoomData.interviewType,
        sessionInterval: normalizedRoomData.sessionInterval,
      };

      const result = await analyzeResume(analysisPayload);

      const interviewId = result?.interview_id;
      if (!interviewId) {
        throw new Error('Failed to create room. Please try again.');
      }

      const newRoom: Room = {
        id: interviewId,
        userId: user.id,
        ...roomData,
        createdAt: new Date().toISOString(),
        hasCompletedInterview: false,
        transcript: null,
        metrics: null,
        status: 'active',
      };

      setRooms((prev) => {
        const exists = prev.some((room) => room.id === newRoom.id);
        return exists
          ? prev.map((room) => (room.id === newRoom.id ? newRoom : room))
          : [...prev, newRoom];
      });

      return interviewId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create room';
      setError(errorMessage);
      throw err;
    } finally {
      pendingCreates.current.delete(createKey);
      setIsCreatingRoom(false);
    }
  };

  const getRoom = useCallback(
    (roomId: string): Room | undefined =>
      rooms.find((room) => room.id === roomId && room.status !== 'deleted'),
    [rooms]
  );

  const deleteRoom = async (roomId: string): Promise<void> => {
    try {
      const roomToDelete = rooms.find((room) => room.id === roomId);
      if (!roomToDelete) {
        throw new Error('Room not found');
      }

      await apiRequest({
        endpoint: `/api/v1/sessions/interview/${roomId}`,
        method: 'DELETE',
      });

      setRooms((prev) => prev.filter((room) => room.id !== roomId));
    } catch (error) {
      console.error('Failed to delete interview:', error);
      setError('Failed to delete room. Please try again.');
      throw error;
    }
  };

  const markRoomAsCompleted = async (roomId: string): Promise<void> => {
    try {
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: { hasCompletedInterview: true },
      });
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? updatedRoom : room))
      );
    } catch (err) {
      setError('Failed to mark room as completed');
      throw err;
    }
  };

  const updateRoom = async (
    roomId: string,
    updates: Partial<Omit<Room, 'id'>>
  ): Promise<void> => {
    try {
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: updates,
      });
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? updatedRoom : room))
      );
    } catch (err) {
      setError('Failed to update room');
      throw err;
    }
  };

  const getCompletedRooms = useCallback(
    () =>
      rooms.filter((room) => room.hasCompletedInterview && room.status !== 'deleted'),
    [rooms]
  );

  const getPendingRooms = useCallback(
    () =>
      rooms.filter((room) => !room.hasCompletedInterview && room.status !== 'deleted'),
    [rooms]
  );

  return (
    <InterviewContext.Provider
      value={{
        rooms,
        loading,
        error,
        isCreatingRoom,
        createRoom,
        getRoom,
        deleteRoom,
        markRoomAsCompleted,
        updateRoom,
        getCompletedRooms,
        getPendingRooms,
        clearError,
        refetchRooms: fetchRooms, // ✅ Returned here
      }}
    >
      {children}
    </InterviewContext.Provider>
  );
};

export const useInterview = (): InterviewContextType => {
  const context = useContext(InterviewContext);
  if (!context) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};
