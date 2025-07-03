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
  id: string; // session_id
  interview_id: string; // interview_id from backend — mandatory
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
      | 'interview_id'
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
}

const InterviewContext = createContext<InterviewContextType | undefined>(
  undefined
);

export const InterviewProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const { user, isLoading: authLoading } = useAuth();

  // Track pending create keys to prevent duplicate creates with same data
  const pendingCreates = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    const fetchRooms = async () => {
      if (!user) return;

      setLoading(true);
      setError(null);
      try {
        console.log('➡️ Fetching rooms for user:', user.id);

        const data = await apiRequest<{ sessions: Room[] }>({
          endpoint: '/api/v1/sessions/',
          method: 'GET',
        });

        if (isMounted) {
          const sessions = Array.isArray(data.sessions) ? data.sessions : [];
          setRooms(sessions);
          setLoading(false);
          console.log('✅ Rooms fetched:', sessions);
        }
      } catch (err) {
        console.error('❌ Failed to fetch rooms:', err);
        if (isMounted) {
          setRooms([]);
          setError('Failed to fetch rooms');
          setLoading(false);
        }
      }
    };

    if (!authLoading && user) {
      fetchRooms();
    }

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  const createRoom = async (
    roomData: Omit<
      Room,
      | 'id'
      | 'createdAt'
      | 'hasCompletedInterview'
      | 'transcript'
      | 'metrics'
      | 'interview_id'
    >
  ): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    // Generate a unique key to detect duplicate create calls with same data
    const createKey = JSON.stringify({
      targetRole: roomData.targetRole,
      targetCompany: roomData.targetCompany,
      interviewType: roomData.interviewType,
      yearsOfExperience: roomData.yearsOfExperience,
      currentDesignation: roomData.currentDesignation,
      sessionInterval: roomData.sessionInterval,
    });

    if (pendingCreates.current.has(createKey)) {
      console.warn('Duplicate createRoom call prevented:', createKey);
      throw new Error('Room creation already in progress for this data');
    }

    if (isCreatingRoom) {
      console.warn('Room creation already in progress globally');
      throw new Error('Room creation already in progress');
    }

    pendingCreates.current.add(createKey);
    setIsCreatingRoom(true);

    try {
      console.log('➡️ Creating room with data:', roomData);
      const analysisPayload = {
        targetRole: roomData.targetRole,
        targetCompany: roomData.targetCompany,
        yearsOfExperience: roomData.yearsOfExperience.toString(),
        currentDesignation: roomData.currentDesignation,
        interviewType: roomData.interviewType,
        sessionInterval: roomData.sessionInterval,
      };

      const result = await analyzeResume(analysisPayload);

      const sessionId = result?.session_id;
      const interviewId = result?.interview_id;

      if (!sessionId || !interviewId) {
        throw new Error('Failed to get session ID or interview ID from analysis');
      }

      const newRoom: Room = {
        id: sessionId,
        interview_id: interviewId,
        userId: user.id,
        ...roomData,
        createdAt: new Date().toISOString(),
        hasCompletedInterview: false,
        transcript: null,
        metrics: null,
      };

      setRooms((prev) => {
        const exists = prev.some(room => room.id === newRoom.id);
        if (exists) {
          return prev.map(room => (room.id === newRoom.id ? newRoom : room));
        } else {
          return [...prev, newRoom];
        }
      });
      console.log('✅ Room added or updated:', newRoom);
      return sessionId;
    } catch (err) {
      console.error('❌ Failed to create room:', err);
      throw err;
    } finally {
      pendingCreates.current.delete(createKey);
      setIsCreatingRoom(false);
    }
  };

  const getRoom = useCallback(
    (roomId: string): Room | undefined => {
      const found = rooms.find(
        (room) => room.id === roomId && room.interview_id !== '0'
      );
      console.log(`🔍 getRoom(${roomId}):`, found);
      return found;
    },
    [rooms]
  );

  const deleteRoom = async (roomId: string): Promise<void> => {
    try {
      const roomToDelete = rooms.find((room) => room.id === roomId);
      if (!roomToDelete) {
        console.warn(`Room with id ${roomId} not found.`);
        return;
      }
      if (!roomToDelete.interview_id) {
        console.warn(`Room with id ${roomId} has no interview_id.`);
        return;
      }

      console.log(`➡️ Deleting interview with interview_id: ${roomToDelete.interview_id}`);

      await apiRequest({
        endpoint: `/api/v1/sessions/interview/${roomToDelete.interview_id}`,
        method: 'DELETE',
      });

      setRooms((prev) => prev.filter((room) => room.id !== roomId));
      console.log(`✅ Interview with interview_id ${roomToDelete.interview_id} deleted successfully.`);
    } catch (error) {
      console.error('❌ Failed to delete interview:', error);
    }
  };

  const markRoomAsCompleted = async (roomId: string): Promise<void> => {
    try {
      console.log('➡️ Marking room as completed:', roomId);
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: { hasCompletedInterview: true },
      });
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? updatedRoom : room))
      );
      console.log('✅ Room marked as completed:', updatedRoom);
    } catch (err) {
      console.error('❌ Failed to mark room as completed:', err);
      throw err;
    }
  };

  const updateRoom = async (
    roomId: string,
    updates: Partial<Omit<Room, 'id'>>
  ): Promise<void> => {
    try {
      console.log('➡️ Updating room:', roomId, 'with:', updates);
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: updates,
      });
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? updatedRoom : room))
      );
      console.log('✅ Room updated:', updatedRoom);
    } catch (err) {
      console.error('❌ Failed to update room:', err);
      throw err;
    }
  };

  const getCompletedRooms = useCallback(() => {
    const completed = rooms.filter(
      (room) => room.hasCompletedInterview && room.interview_id !== '0'
    );
    console.log('🔎 Completed rooms:', completed);
    return completed;
  }, [rooms]);

  const getPendingRooms = useCallback(() => {
    const pending = rooms.filter(
      (room) => !room.hasCompletedInterview && room.interview_id !== '0'
    );
    console.log('🔎 Pending rooms:', pending);
    return pending;
  }, [rooms]);

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
      }}
    >
      {children}
    </InterviewContext.Provider>
  );
};

export const useInterview = () => {
  const context = useContext(InterviewContext);
  if (!context) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};
