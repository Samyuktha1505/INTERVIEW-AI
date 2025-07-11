import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Laugh, Smile, Meh, Frown, Angry } from 'lucide-react';

const emojis = {
  1: <Angry className="text-red-400 w-5 h-5" />,
  2: <Frown className="text-orange-400 w-5 h-5" />,
  3: <Meh className="text-yellow-400 w-5 h-5" />,
  4: <Smile className="text-green-400 w-5 h-5" />,
  5: <Laugh className="text-green-500 w-5 h-5" />,
};

const StarRating = ({ rating, setRating }: { rating: number; setRating: (r: number) => void }) => (
  <div className="flex items-center gap-2 text-2xl transition-all">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => setRating(star)}
        className={`hover:scale-125 transition-transform duration-200 ${
          star <= rating ? 'text-yellow-400' : 'text-gray-300'
        } hover:text-yellow-500`}
      >
        ★
      </button>
    ))}
    {rating > 0 && emojis[rating]}
  </div>
);

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { sessionId: string; feedback_text: string; rating: number }) => void;
  sessionId: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose, onSubmit, sessionId }) => {
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const MAX_CHARS = 300;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim() || rating === 0) {
      setError('Please share your thoughts and a star rating!');
      return;
    }

    setSubmitting(true);
    setError('');
    await onSubmit({ sessionId, feedback_text: feedback, rating });
    toast.success('🎉 You’re awesome! Thanks for your feedback!');
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

    setSubmitting(false);
    setFeedback('');
    setRating(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl shadow-xl p-6 transition-all animate-fadeIn bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            We  value  your  Feeback! 💬
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Help us improve by rating your experience 🌟
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Your Feedback</label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What did you enjoy or suggest we improve?"
              maxLength={MAX_CHARS}
              className="resize-none h-24 rounded-lg border-gray-300"
              required
            />
            <p className="text-xs text-right text-gray-500">{feedback.length}/{MAX_CHARS}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Your Rating</label>
            <StarRating rating={rating} setRating={setRating} />
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <DialogFooter>
            <button
              type="button"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl mr-2 text-sm transition"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-xl text-sm font-medium hover:opacity-90 transition"
              disabled={submitting}
            >
              {submitting ? 'Sending...' : 'Send Feedback'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;