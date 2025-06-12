import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, ShieldAlert } from "lucide-react";
import { Metrics } from '../services/metricsService';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: Metrics | null;
}

const ScoreBar = ({ score, label }: { score: number; label: string }) => {
  const percentage = (score / 10) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-sm font-bold text-slate-800">{score.toFixed(2)} / 10.00</p>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
};


export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, metrics }) => {
  if (!metrics) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Interview Performance Report</DialogTitle>
          <DialogDescription>
            An AI-generated analysis of the interview session.
          </DialogDescription>
        </DialogHeader>

        {/* --- THIS IS THE MODIFIED LINE --- */}
        <div className="mt-4 space-y-6 max-h-[70vh] overflow-y-auto pr-6">
        {/*
          - max-h-[70vh] limits the height of this div to 70% of the viewport height.
          - overflow-y-auto adds a vertical scrollbar ONLY when the content is too long.
          - pr-6 (padding-right) prevents the content from overlapping with the scrollbar.
        */}

          {/* Scores Section */}
          <div className="p-4 border rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Performance Scores</h3>
            <div className="space-y-4">
              <ScoreBar score={metrics.technical_rating} label="Technical Rating" />
              <ScoreBar score={metrics.communication_rating} label="Communication Rating" />
              <ScoreBar score={metrics.problem_solving_rating} label="Problem Solving Rating" />
              <ScoreBar score={metrics.overall_rating} label="Overall Rating" />

            </div>
          </div>
          
          {/* Integrity Check Section */}
          <div className="p-4 border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Integrity Check</h3>
            {metrics.suspicious_flag ? (
              <Badge variant="destructive" className="flex items-center w-fit">
                <ShieldAlert className="h-4 w-4 mr-2" />
                Suspicious Activity Flagged
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center w-fit bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle className="h-4 w-4 mr-2" />
                No Suspicious Activity Detected
              </Badge>
            )}
          </div>

          {/* AI Insights Section */}
          {/* AI Insights Section */}
        <div className="p-4 border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">AI Remarks</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{metrics.remarks}</p>
        </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};