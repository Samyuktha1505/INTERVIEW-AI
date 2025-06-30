import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from "../contexts/AuthContext";
import { analyzeResume } from "../services/resumeAnalysis"; // Your resume analysis API call

export interface Room {
  id: string;
  userId?: string;
  targetRole: string;
  targetCompany: string;
  interviewType: string;
  yearsOfExperience: number;
  currentDesignation: string;
  sessionInterval?: number;
  createdAt: string;
  hasCompletedInterview?: boolean;
  transcript?: string;
  metrics?: any;
}

interface InterviewContextType {
  rooms: Room[];
  createRoom: (roomData: Omit<Room, 'id' | 'createdAt' | 'hasCompletedInterview' | 'transcript' | 'metrics'>) => Promise<string>;
  getRoom: (roomId: string) => Room | undefined;
  deleteRoom: (roomId: string) => Promise<void>;
  markRoomAsCompleted: (roomId: string) => Promise<void>;
  updateRoom: (roomId: string, updates: Partial<Omit<Room, 'id'>>) => Promise<void>;
  getCompletedRooms: () => Room[];
  getPendingRooms: () => Room[];
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export const InterviewProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/v1/sessions/", {
          credentials: "include",
        });

        if (res.status === 401) {
          console.warn("Not authorized to fetch rooms. User might not be logged in.");
          return;
        }

        const data = await res.json();
        setRooms(data.sessions);
      } catch (error) {
        console.error("Failed to fetch rooms:", error);
      }
    };

    if (user) {
      fetchRooms();
    }
  }, [user]);

  const createRoom = async (
    roomData: Omit<Room, 'id' | 'createdAt' | 'hasCompletedInterview' | 'transcript' | 'metrics'>
  ): Promise<string> => {
    if (!user) throw new Error("User not authenticated");

    try {
      // Compose payload as expected by analyzeResume backend endpoint
      const analysisPayload = {
        targetRole: roomData.targetRole,
        targetCompany: roomData.targetCompany,
        yearsOfExperience: roomData.yearsOfExperience,
        currentDesignation: roomData.currentDesignation,
        interviewType: roomData.interviewType,
        sessionInterval: roomData.sessionInterval,
        user_email: user.email,
      };

      // Call the analyzeResume API which creates the session and returns session_id
      const result = await analyzeResume(analysisPayload);
      const sessionId = result.session_id;

      // Construct the new Room object locally for your frontend state
      const newRoom: Room = {
        id: sessionId,
        userId: user.id,
        targetRole: roomData.targetRole,
        targetCompany: roomData.targetCompany,
        interviewType: roomData.interviewType,
        yearsOfExperience: roomData.yearsOfExperience,
        currentDesignation: roomData.currentDesignation,
        sessionInterval: roomData.sessionInterval,
        createdAt: new Date().toISOString(),
        hasCompletedInterview: false,
        transcript: undefined,
        metrics: undefined,
      };

      // Update rooms state locally
      setRooms((prev) => [...prev, newRoom]);

      return sessionId;
    } catch (err) {
      console.error("Failed to create room:", err);
      throw err;
    }
  };

  const getRoom = useCallback((roomId: string): Room | undefined => {
    return rooms.find(room => room.id === roomId);
  }, [rooms]);

  const deleteRoom = async (roomId: string): Promise<void> => {
    try {
      await fetch(`http://localhost:8000/api/v1/sessions/${roomId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setRooms(prev => prev.filter(room => room.id !== roomId));
    } catch (error) {
      console.error("Failed to delete room:", error);
      throw error;
    }
  };

  const markRoomAsCompleted = async (roomId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/sessions/${roomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hasCompletedInterview: true }),
      });
      const updatedRoom = await res.json();
      setRooms(prev => prev.map(r => (r.id === roomId ? updatedRoom : r)));
    } catch (error) {
      console.error("Failed to mark room as completed:", error);
    }
  };

  const updateRoom = async (roomId: string, updates: Partial<Omit<Room, 'id'>>) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/sessions/${roomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const updatedRoom = await res.json();
      setRooms(prev => prev.map(r => (r.id === roomId ? updatedRoom : r)));
    } catch (error) {
      console.error("Failed to update room:", error);
      throw error;
    }
  };

  const getCompletedRooms = useCallback(() => {
    return rooms.filter(room => room.hasCompletedInterview);
  }, [rooms]);

  const getPendingRooms = useCallback(() => {
    return rooms.filter(room => !room.hasCompletedInterview);
  }, [rooms]);

  return (
    <InterviewContext.Provider value={{
      rooms,
      createRoom,
      getRoom,
      deleteRoom,
      markRoomAsCompleted,
      updateRoom,
      getCompletedRooms,
      getPendingRooms
    }}>
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
