import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useInterview } from "../contexts/InterviewContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  User,
  Settings,
  LogOut,
  Video,
  Edit,
  Trash2,
  Menu,
  FileText,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CreateRoomModal from "../components/CreateRoomModal";
import { ReportModal } from "../components/ReportModal";
import { generateAndFetchMetrics, Metrics } from "../services/metricsService";
import { checkCompletedSessions } from "../services/interviewService";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { rooms, deleteRoom, loading } = useInterview();
  const navigate = useNavigate();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Metrics | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [completedRoomIds, setCompletedRoomIds] = useState<Set<string>>(
    new Set()
  );

  const [showResetPassword, setShowResetPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Filter rooms owned by current user and with status 'scheduled'
  const deletedRooms = JSON.parse(localStorage.getItem('deletedRooms') || '[]');
  const userRooms = rooms.filter(
    (room) =>
      String(room.userId) === String(user?.id) &&
      !deletedRooms.includes(room.id)
  );

  // Check which rooms are completed for enabling report generation
  useEffect(() => {
    if (userRooms.length > 0) {
      const roomIds = userRooms.map((room) => room.id);
      checkCompletedSessions(roomIds).then((completedIds) => {
        setCompletedRoomIds(completedIds);
      });
    }
  }, [rooms, user?.id]);

  // Logout handler
  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out successfully",
      description: "See you next time!",
    });
    navigate("/");
  };

  // Delete room handler with confirm dialog
  const handleDeleteRoom = (roomId: string) => {
    if (window.confirm("Are you sure you want to remove this interview room from your dashboard?")) {
      deleteRoom(roomId); // This should update the rooms state in your context
      toast({
        title: "Room deleted",
        description: "Interview room has been removed from your dashboard.",
      });
      localStorage.setItem('deletedRooms', JSON.stringify([...deletedRooms, roomId]));
    }
  };

  // Password validation function
  const validatePassword = (password: string) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return {
      isValid:
        password.length >= minLength &&
        hasUpperCase &&
        hasLowerCase &&
        hasNumber &&
        hasSpecialChar,
      message:
        "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
    };
  };

  // Navigate to interview session page
  const handleStartInterview = (roomId: string) => {
    navigate(`/interview-session/${roomId}`);
  };

  // Generate report handler with loading state
  const handleGenerateReport = async (roomId: string) => {
    setIsReportLoading(roomId);
    try {
      const metrics = await generateAndFetchMetrics(roomId);
      setSelectedMetrics(metrics);
      setIsReportModalOpen(true);
    } catch (error: any) {
      toast({
        title: "Error Generating Report",
        description: error.message || "Could not generate report.",
        variant: "destructive",
      });
    } finally {
      setIsReportLoading(null);
    }
  };

  // Sidebar content reused for desktop and mobile
  const sidebarContent = (
    <div className="h-full flex flex-col">
    <div className="p-6 border-b">
      <h2 className="text-xl font-bold text-primary">InterviewAI</h2>
    </div>
    <nav className="flex-1 p-6">
      <div className="flex flex-col gap-y-3">
        <Link to="/" onClick={() => setIsSidebarOpen(false)}>
          <Button className="w-full justify-start">
            <User className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <Link to="/interview-logs" onClick={() => setIsSidebarOpen(false)}>
          <Button className="w-full justify-start">
            <Video className="mr-2 h-4 w-4" />
            Interview Insights
          </Button>
        </Link>
        <Link to="/profile" onClick={() => setIsSidebarOpen(false)}>
          <Button className="w-full justify-start">
            <Settings className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        </Link>
      </div>
    </nav>
      <div className="p-6 border-t">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button
          className="w-full mb-2"
          onClick={() => {
            setShowResetPassword(true);
            setIsSidebarOpen(false);
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          Reset Password
        </Button>
        <Button className="w-full" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  // Show loading spinner while rooms are loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="text-lg font-medium">Loading interview rooms...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 bg-card border-r">{sidebarContent}</div>

      {/* Mobile Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent side="left">{sidebarContent}</SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-card border-b p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    className="lg:hidden"
                    onClick={() => setIsSidebarOpen(true)}
                    aria-label="Open sidebar menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
              </Sheet>
              <div>
                <h1 className="text-2xl font-bold">
                  Welcome back, {user?.firstName}!
                </h1>
                <p className="text-muted-foreground">
                  Ready to practice your next interview?
                </p>
              </div>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="transition-all duration-300 hover:scale-105"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Room
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
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
                <div className="text-2xl font-bold">
                  {user?.yearsOfExperience || 0} Years
                </div>
                <p className="text-xs text-muted-foreground">Professional experience</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">100%</div>
                <p className="text-xs text-muted-foreground">Profile completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Interview Rooms Section */}
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
                  <Card
                    key={room.id}
                    className="flex flex-col justify-between transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
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
                          <strong>Created:</strong>{" "}
                          {new Date(room.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => handleStartInterview(room.id)}
                          className="col-span-2"
                        >
                          <Video className="mr-2 h-4 w-4" />
                          Start Interview
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => handleGenerateReport(room.id)}
                          disabled={
                            !completedRoomIds.has(room.id) ||
                            isReportLoading === room.id
                          }
                          className="col-span-2"
                        >
                          {isReportLoading === room.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-2 h-4 w-4" />
                          )}
                          Generate Report
                        </Button>

                        <Button variant="outline" size="icon" aria-label="Edit room">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          aria-label="Delete room"
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

      {/* Create Room Modal */}
      <CreateRoomModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        metrics={selectedMetrics}
      />

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-center">Reset Password</h2>

            {errorMessage && (
              <div className="text-red-500 text-sm mb-2">{errorMessage}</div>
            )}

            <label className="block text-sm font-medium">Old Password</label>
            <div className="relative">
              <input
                type={showOldPassword ? "text" : "password"}
                className="w-full border rounded px-3 py-2 mb-2 pr-10"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  setErrorMessage("");
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                onClick={() => setShowOldPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showOldPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <label className="block text-sm font-medium">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                className="w-full border rounded px-3 py-2 mb-2 pr-10"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setErrorMessage("");
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                onClick={() => setShowNewPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <label className="block text-sm font-medium">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="w-full border rounded px-3 py-2 mb-4 pr-10"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrorMessage("");
                }}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                className="w-full"
                disabled={resetLoading}
                onClick={async () => {
                  if (!oldPassword || !newPassword || !confirmPassword) {
                    setErrorMessage("All fields are required");
                    return;
                  }
                  if (newPassword !== confirmPassword) {
                    setErrorMessage("New passwords do not match");
                    return;
                  }
                  const validation = validatePassword(newPassword);
                  if (!validation.isValid) {
                    setErrorMessage(validation.message);
                    return;
                  }

                  setResetLoading(true);
                  try {
                    const formData = new FormData();
                    formData.append("email", user?.email || "");
                    formData.append("old_password", oldPassword);
                    formData.append("new_password", newPassword);

                    const res = await fetch(
                      "http://localhost:8000/api/v1/auth/dashboard-reset-password",
                      {
                        method: "POST",
                        body: formData,
                        credentials: "include",
                      }
                    );

                    const data = await res.json();

                    if (res.ok && data.success) {
                      toast({
                        title: "Password Reset",
                        description: "Password updated successfully",
                      });
                      // Close modal and clear inputs on success
                      setShowResetPassword(false);
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setErrorMessage("");
                    } else {
                      setErrorMessage(data.message || "Could not reset password");
                    }
                  } catch {
                    setErrorMessage("Server error. Please try again.");
                  } finally {
                    setResetLoading(false);
                  }
                }}
              >
                {resetLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {resetLoading ? "Resetting..." : "Reset Password"}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowResetPassword(false);
                  setErrorMessage("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;