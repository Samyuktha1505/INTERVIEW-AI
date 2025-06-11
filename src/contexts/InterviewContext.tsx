import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Defines the structure of an Interview Room
export interface Room {
  id: string; // Will be a UUID string
  userId?: string; // Optional: To associate with a logged-in user
  targetRole: string;
  targetCompany: string;
  interviewType: string;
  yearsOfExperience: number;
  currentDesignation: string;
  sessionInterval?: number;
  resumeUrl?: string;
  createdAt: string; // ISO string format for dates
}

// Defines the shape of our context's value
interface InterviewContextType {
  rooms: Room[];
  createRoom: (roomData: Omit<Room, 'id' | 'createdAt'>) => string;
  getRoom: (roomId: string) => Room | undefined;
  deleteRoom: (roomId: string) => void;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

// The provider component that wraps your app
export const InterviewProvider = ({ children }: { children: ReactNode }) => {
  // Lazy initialize state from localStorage on the first load
  const [rooms, setRooms] = useState<Room[]>(() => {
    try {
      const savedRooms = localStorage.getItem('interviewRooms');
      return savedRooms ? JSON.parse(savedRooms) : [];
    } catch (error) {
      console.error("Failed to parse rooms from localStorage", error);
      return [];
    }
  });

  // This effect automatically saves rooms to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('interviewRooms', JSON.stringify(rooms));
  }, [rooms]);

  // Creates a new room with a unique UUID
  const createRoom = (roomData: Omit<Room, 'id' | 'createdAt'>): string => {
    const newId = uuidv4();
    const newRoom: Room = {
      ...roomData,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    setRooms((prevRooms) => [...prevRooms, newRoom]);
    return newId; // Return the new ID so it can be sent to the backend
  };

  const getRoom = (roomId: string): Room | undefined => {
    return rooms.find(room => room.id === roomId);
  };

  const deleteRoom = (roomId: string): void => {
    setRooms((prevRooms) => prevRooms.filter(room => room.id !== roomId));
  };

  const value = { rooms, createRoom, getRoom, deleteRoom };

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
};

// A custom hook for easy access to the context
export const useInterview = () => {
  const context = useContext(InterviewContext);
  if (context === undefined) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};