import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { useAuth } from '../contexts/AuthContext';
import { analyzeResume } from '../services/resumeAnalysis';
import { apiRequest } from '../services/interviewService';

export interface Room {
  id: string;
  interview_id?: string;
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
  createRoom: (
    roomData: Omit<
      Room,
      'id' | 'createdAt' | 'hasCompletedInterview' | 'transcript' | 'metrics'
    >
  ) => Promise<string>;
  getRoom: (roomId: string) => Room | undefined;
  deleteRoom: (roomId: string) => void;
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
  const [loading, setLoading] = useState(true); // start loading true for initial fetch
  const [error, setError] = useState<string | null>(null);

  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    let isMounted = true;

    const fetchRooms = async () => {
      if (!user) {
        console.warn('⚠️ User not set yet, skipping fetch.');
        if (isMounted) {
          setRooms([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      console.log('➡️ Fetching rooms for user:', user.id);
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<{ sessions: Room[] }>({
          endpoint: '/api/v1/sessions/',
          method: 'GET',
        });

        console.log('⬅️ Fetched rooms from API:', data.sessions);

        if (isMounted) {
          setRooms(Array.isArray(data.sessions) ? data.sessions : []);
          setLoading(false);
          console.log('✅ Rooms state updated and loading set to false');
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

    if (!authLoading) {
      fetchRooms();
    }

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  const createRoom = async (
    roomData: Omit<
      Room,
      'id' | 'createdAt' | 'hasCompletedInterview' | 'transcript' | 'metrics'
    >
  ): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    try {
      console.log('➡️ Creating room with data:', roomData);
      const analysisPayload = {
        session_id: '', // optional if backend assigns it
        targetRole: roomData.targetRole,
        targetCompany: roomData.targetCompany,
        yearsOfExperience: roomData.yearsOfExperience.toString(),
        currentDesignation: roomData.currentDesignation,
        interviewType: roomData.interviewType,
        sessionInterval: roomData.sessionInterval,
      };

      const result = await analyzeResume(analysisPayload);
      const sessionId = result?.session_id;

      if (!sessionId) throw new Error('Failed to get session ID from analysis');

      const newRoom: Room = {
        id: sessionId,
        userId: user.id,
        ...roomData,
        createdAt: new Date().toISOString(),
        hasCompletedInterview: false,
        transcript: null,
        metrics: null,
      };

      setRooms((prev) => {
        console.log('✅ Adding new room to state:', newRoom);
        return [...prev, newRoom];
      });
      return sessionId;
    } catch (err) {
      console.error('❌ Failed to create room:', err);
      throw err;
    }
  };

  const getRoom = useCallback(
    (roomId: string): Room | undefined => {
      const found = rooms.find((room) => room.id === roomId && room.interview_id !== '0');
      console.log(`🔍 getRoom called for id=${roomId}, found:`, found);
      return found;
    },
    [rooms]
  );

  const deleteRoom = (roomId: string): void => {
    setRooms((prev) => prev.filter((room) => room.id !== roomId));
  };

  const markRoomAsCompleted = async (roomId: string): Promise<void> => {
    try {
      console.log('➡️ Marking room as completed:', roomId);
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: { hasCompletedInterview: true },
      });
      setRooms((prev) => {
        console.log('✅ Updating room as completed:', updatedRoom);
        return prev.map((room) => (room.id === roomId ? updatedRoom : room));
      });
    } catch (error) {
      console.error('❌ Failed to mark room as completed:', error);
      throw error;
    }
  };

  const updateRoom = async (
    roomId: string,
    updates: Partial<Omit<Room, 'id'>>
  ): Promise<void> => {
    try {
      console.log('➡️ Updating room:', roomId, 'with updates:', updates);
      const updatedRoom = await apiRequest<Room>({
        endpoint: `/api/v1/sessions/${roomId}`,
        method: 'PUT',
        body: updates,
      });
      setRooms((prev) => {
        console.log('✅ Room updated:', updatedRoom);
        return prev.map((room) => (room.id === roomId ? updatedRoom : room));
      });
    } catch (error) {
      console.error('❌ Failed to update room:', error);
      throw error;
    }
  };

  const getCompletedRooms = useCallback(() => {
    const completed = rooms.filter((room) => room.hasCompletedInterview && room.interview_id !== '0');
    console.log('🔎 getCompletedRooms:', completed);
    return completed;
  }, [rooms]);

  const getPendingRooms = useCallback(() => {
    const pending = rooms.filter((room) => !room.hasCompletedInterview && room.interview_id !== '0');
    console.log('🔎 getPendingRooms:', pending);
    return pending;
  }, [rooms]);

  return (
    <InterviewContext.Provider
      value={{
        rooms,
        loading,
        error,
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
