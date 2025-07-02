import React, { useState, useEffect } from 'react';
import { useAuth } from "../contexts/AuthContext";
import { useInterview } from "../contexts/InterviewContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Code, MessageSquare, Cpu, Shield, FileText, Video } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generateAndFetchMetrics, Metrics } from '../services/metricsService';
import { checkCompletedSessions } from '../services/interviewService';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend);

const InterviewLogs = () => {
  const { user } = useAuth();
  const { rooms } = useInterview();
  const [completedRoomIds, setCompletedRoomIds] = useState<Set<string>>(new Set());
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const [metricsData, setMetricsData] = useState<Record<string, Metrics>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<string>>(new Set());

  const userRooms = rooms.filter(room => room.userId === user?.id);
  const completedRooms = userRooms.filter(room => completedRoomIds.has(room.id));

  useEffect(() => {
    if (userRooms.length > 0) {
      const roomIds = userRooms.map(room => room.id);
      checkCompletedSessions(roomIds).then(completedIds => {
        setCompletedRoomIds(completedIds);
      });
    }
  }, [rooms, user?.id]);

  const toggleReport = (roomId: string) => {
    const newSet = new Set(expandedReports);
    if (newSet.has(roomId)) {
      newSet.delete(roomId);
    } else {
      newSet.add(roomId);
      if (!metricsData[roomId]) {
        loadMetrics(roomId);
      }
    }
    setExpandedReports(newSet);
  };

  const loadMetrics = async (roomId: string) => {
    setLoadingMetrics(prev => new Set(prev).add(roomId));
    try {
      const metrics = await generateAndFetchMetrics(roomId);
      setMetricsData(prev => ({ ...prev, [roomId]: metrics }));
    } catch (error: any) {
      toast({
        title: "Error Loading Report",
        description: error.message || "Could not load report metrics.",
        variant: "destructive",
      });
    } finally {
      setLoadingMetrics(prev => {
        const newSet = new Set(prev);
        newSet.delete(roomId);
        return newSet;
      });
    }
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 8) return { text: "Excellent", color: "bg-green-500" };
    if (score >= 6) return { text: "Good", color: "bg-blue-500" };
    return { text: "Needs Improvement", color: "bg-yellow-500" };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPieChartData = (metrics: Metrics) => {
    return {
      labels: ['Technical', 'Communication', 'Problem Solving'],
      datasets: [
        {
          data: [
            metrics.technical_rating,
            metrics.communication_rating,
            metrics.problem_solving_rating
          ],
          backgroundColor: [
            'rgba(54, 162, 235, 0.7)',
            'rgba(75, 192, 192, 0.7)',
            'rgba(255, 159, 64, 0.7)'
          ],
          borderColor: [
            'rgba(54, 162, 235, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(255, 159, 64, 1)'
          ],
          borderWidth: 1,
        },
      ],
    };
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Your Interview Reports</h1>
      
      {completedRooms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No interview reports yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Complete an interview to see your performance reports
            </p>
            <Link to="/dashboard">
              <Button>
                <Video className="mr-2 h-4 w-4" />
                Start an Interview
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {completedRooms.map((room) => {
            const metrics = metricsData[room.id];
            const isExpanded = expandedReports.has(room.id);
            const isLoading = loadingMetrics.has(room.id);
            const performanceBadge = metrics ? getPerformanceBadge(metrics.overall_rating) : null;

            return (
              <Card key={room.id} className="overflow-hidden">
                <div 
                  className="flex items-center justify-between p-6 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => toggleReport(room.id)}
                >
                  <div>
                    <h3 className="font-medium text-lg">{room.targetRole}</h3>
                    <p className="text-sm text-muted-foreground">
                      {room.targetCompany} • {formatDate(room.createdAt)} • {room.interviewType}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {performanceBadge && (
                      <Badge className={`${performanceBadge.color} text-white`}>
                        {performanceBadge.text}
                      </Badge>
                    )}
                    {metrics && (
                      <Badge variant="secondary">
                        Overall: {metrics.overall_rating.toFixed(1)}/10
                      </Badge>
                    )}
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t p-6">
                    {isLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : metrics ? (
                      <div className="space-y-6">
                        {/* Performance Scores */}
                        <div>
                          <h4 className="font-medium mb-4">Performance Scores</h4>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1">
                              <div className="h-full">
                                <Pie 
                                  data={getPieChartData(metrics)}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    plugins: {
                                      legend: {
                                        position: 'bottom',
                                      },
                                      tooltip: {
                                        callbacks: {
                                          label: function(context) {
                                            return `${context.label}: ${(context.raw as number).toFixed(1)}/10`;
                                          }
                                        }
                                      }
                                    }
                                  }}
                                />
                              </div>
                            </div>
                            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Card>
                                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                                  <Code className="h-4 w-4 mr-2 text-muted-foreground" />
                                  <CardTitle className="text-sm font-medium">
                                    Technical
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="text-2xl font-bold">
                                    {metrics.technical_rating.toFixed(1)} / 10
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                                  <MessageSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                                  <CardTitle className="text-sm font-medium">
                                    Communication
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="text-2xl font-bold">
                                    {metrics.communication_rating.toFixed(1)} / 10
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                                  <Cpu className="h-4 w-4 mr-2 text-muted-foreground" />
                                  <CardTitle className="text-sm font-medium">
                                    Problem Solving
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="text-2xl font-bold">
                                    {metrics.problem_solving_rating.toFixed(1)} / 10
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </div>
                        </div>

                        {/* Integrity Check */}
                        <div>
                          <h4 className="font-medium mb-4">Integrity Check</h4>
                          <Card className={metrics.suspicious_flag ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}>
                            <CardContent className="p-4">
                              <div className="flex items-center">
                                <div className={`p-2 rounded-full mr-3 ${metrics.suspicious_flag ? "bg-red-100" : "bg-green-100"}`}>
                                  <Shield className={`h-5 w-5 ${metrics.suspicious_flag ? "text-red-600" : "text-green-600"}`} />
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {metrics.suspicious_flag ? "Suspicious Activity Detected" : "No Issues Found"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {metrics.suspicious_flag 
                                      ? "Potential rule violations detected" 
                                      : "Your interview session followed all guidelines"}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* AI Remarks */}
                        <div>
                          <h4 className="font-medium mb-4">AI Feedback</h4>
                          <Card>
                            <CardContent className="p-4">
                              <p className="text-sm">
                                {metrics.remarks || "No specific feedback available for this interview."}
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        Could not load report data
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InterviewLogs;