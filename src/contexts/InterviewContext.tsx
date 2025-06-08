
import React, { createContext, useContext, useState, useEffect } from 'react';

export interface InterviewRoom {
  id: string;
  currentRole: string;
  targetRole: string;
  targetCompany: string;
  yearsOfExperience: number;
  interviewType: string;
  resumeUrl?: string;
  createdAt: string;
  userId: string;
}

interface InterviewContextType {
  rooms: InterviewRoom[];
  createRoom: (roomData: Omit<InterviewRoom, 'id' | 'createdAt' | 'userId'>) => string;
  updateRoom: (roomId: string, roomData: Partial<InterviewRoom>) => void;
  deleteRoom: (roomId: string) => void;
  getRoom: (roomId: string) => InterviewRoom | undefined;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export const useInterview = () => {
  const context = useContext(InterviewContext);
  if (context === undefined) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};

export const InterviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rooms, setRooms] = useState<InterviewRoom[]>([]);

  useEffect(() => {
    const storedRooms = localStorage.getItem('interviewRooms');
    if (storedRooms) {
      setRooms(JSON.parse(storedRooms));
    }
  }, []);

  const saveRooms = (newRooms: InterviewRoom[]) => {
    setRooms(newRooms);
    localStorage.setItem('interviewRooms', JSON.stringify(newRooms));
  };

  const createRoom = (roomData: Omit<InterviewRoom, 'id' | 'createdAt' | 'userId'>): string => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const newRoom: InterviewRoom = {
      ...roomData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: user.id
    };
    
    const newRooms = [...rooms, newRoom];
    saveRooms(newRooms);
    return newRoom.id;
  };

  const updateRoom = (roomId: string, roomData: Partial<InterviewRoom>) => {
    const newRooms = rooms.map(room => 
      room.id === roomId ? { ...room, ...roomData } : room
    );
    saveRooms(newRooms);
  };

  const deleteRoom = (roomId: string) => {
    const newRooms = rooms.filter(room => room.id !== roomId);
    saveRooms(newRooms);
  };

  const getRoom = (roomId: string) => {
    return rooms.find(room => room.id === roomId);
  };

  const value = {
    rooms,
    createRoom,
    updateRoom,
    deleteRoom,
    getRoom
  };

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>;
};
