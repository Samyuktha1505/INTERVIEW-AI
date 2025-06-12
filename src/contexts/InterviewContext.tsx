import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface Room {
  id: string;
  userId?: string;
  targetRole: string;
  targetCompany: string;
  interviewType: string;
  yearsOfExperience: number;
  currentDesignation: string;
  sessionInterval?: number;
  resumeUrl?: string;
  createdAt: string;
  hasCompletedInterview?: boolean; // <-- NEW: Flag to track completion
}

interface InterviewContextType {
  rooms: Room[];
  createRoom: (roomData: Omit<Room, 'id' | 'createdAt' | 'hasCompletedInterview'>) => string;
  getRoom: (roomId: string) => Room | undefined;
  deleteRoom: (roomId: string) => void;
  markRoomAsCompleted: (roomId: string) => void; // <-- NEW: Action to set the flag
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export const InterviewProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>(() => {
    try {
      const savedRooms = localStorage.getItem('interviewRooms');
      return savedRooms ? JSON.parse(savedRooms) : [];
    } catch (error) {
      console.error("Failed to parse rooms from localStorage", error);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('interviewRooms', JSON.stringify(rooms));
  }, [rooms]);

  const createRoom = (roomData: Omit<Room, 'id' | 'createdAt' | 'hasCompletedInterview'>): string => {
    const newId = uuidv4();
    const newRoom: Room = {
      ...roomData,
      id: newId,
      createdAt: new Date().toISOString(),
      hasCompletedInterview: false, // Default to false on creation
    };
    setRooms((prevRooms) => [...prevRooms, newRoom]);
    return newId;
  };

  const getRoom = (roomId: string): Room | undefined => {
    return rooms.find(room => room.id === roomId);
  };

  const deleteRoom = (roomId: string): void => {
    setRooms((prevRooms) => prevRooms.filter(room => room.id !== roomId));
  };

  // NEW: Implementation of the new action
  const markRoomAsCompleted = (roomId: string) => {
    setRooms(prevRooms =>
      prevRooms.map(room =>
        room.id === roomId ? { ...room, hasCompletedInterview: true } : room
      )
    );
  };

  const value = { rooms, createRoom, getRoom, deleteRoom, markRoomAsCompleted };

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
};

export const useInterview = () => {
  const context = useContext(InterviewContext);
  if (context === undefined) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};