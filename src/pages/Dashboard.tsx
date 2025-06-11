import React, { useState } from 'react';
import { useAuth } from "../contexts/AuthContext";
import { useInterview } from "../contexts/InterviewContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Calendar, User, Settings, LogOut, Video, Edit, Trash2, Menu } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CreateRoomModal from "../components/CreateRoomModal";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { rooms, deleteRoom } = useInterview();
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const userRooms = rooms.filter(room => room.userId === user?.id);

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out successfully",
      description: "See you next time!",
    });
    navigate('/');
  };

  const handleDeleteRoom = (roomId: string) => {
    if (window.confirm('Are you sure you want to delete this interview room?')) {
      deleteRoom(roomId);
      toast({
        title: "Room deleted",
        description: "Interview room has been removed",
      });
    }
  };
  
  // MODIFIED: This function now navigates directly to the live session
  const handleStartInterview = (roomId: string) => {
    navigate(`/interview-session/${roomId}`);
  };

  const sidebarContent = (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b">
        <h2 className="text-xl font-bold text-primary">InterviewAI</h2>
      </div>
      <nav className="flex-1 p-6 space-y-2">
        <Button className="w-full justify-start" onClick={() => setIsSidebarOpen(false)}>
          <User className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
        <Button className="w-full justify-start" onClick={() => setIsSidebarOpen(false)}>
          <Video className="mr-2 h-4 w-4" />
          Interviews
        </Button>
        <Link to="/profile"> {/* This is the key change */}
    <Button className="w-full justify-start" onClick={() => setIsSidebarOpen(false)}>
      <User className="mr-2 h-4 w-4" />
      Profile
    </Button>
  </Link>
      </nav>
      <div className="p-6 border-t">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button 
          className="w-full" 
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 bg-card border-r">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent />
        {isSidebarOpen && sidebarContent}
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-card border-b p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
              </Sheet>
              <div>
                <h1 className="text-2xl font-bold">Welcome back, {user?.firstName}!</h1>
                <p className="text-muted-foreground">Ready to practice your next interview?</p>
              </div>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)} className="transition-all duration-300 hover:scale-105">
              <Plus className="mr-2 h-4 w-4" />
              Create New Room
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Rooms</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userRooms.length}</div>
                <p className="text-xs text-muted-foreground">
                  Interview rooms created
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Experience</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{user?.yearsOfExperience || 0} Years</div>
                <p className="text-xs text-muted-foreground">
                  Professional experience
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">100%</div>
                <p className="text-xs text-muted-foreground">
                  Profile completed
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Interview Rooms */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Interview Rooms</h2>
            {userRooms.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Video className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No interview rooms yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create your first interview room to start practicing
                  </p>
                  <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Room
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {userRooms.map((room) => (
                  <Card key={room.id} className="transition-all duration-300 hover:scale-105 hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{room.targetRole}</CardTitle>
                          <CardDescription>{room.targetCompany}</CardDescription>
                        </div>
                        <Badge>{room.interviewType}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        <p className="text-sm text-muted-foreground">
                          <strong>Current Designation:</strong> {room.currentDesignation || "N/A"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <strong>Experience:</strong> {room.yearsOfExperience} years
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <strong>Session Interval:</strong> {room.sessionInterval || "Not set"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <strong>Created:</strong> {new Date(room.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          onClick={() => handleStartInterview(room.id)}
                          className="flex-1"
                        >
                          <Video className="mr-2 h-4 w-4" />
                          Start Interview
                        </Button>
                        <Button className="flex-1" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          className="flex-1"
                          variant="destructive"
                          onClick={() => handleDeleteRoom(room.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <CreateRoomModal 
        open={isCreateModalOpen} 
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
};

export default Dashboard;