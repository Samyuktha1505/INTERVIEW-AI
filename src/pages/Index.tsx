import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ArrowRight, CheckCircle, Users, Video, Target } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/signup');
    }
  };

  const features = [
    {
      icon: <Video className="h-8 w-8 text-primary" />,
      title: "AI-Powered Interviews",
      description: "Practice with advanced AI that simulates real interview scenarios"
    },
    {
      icon: <Target className="h-8 w-8 text-primary" />,
      title: "Role-Specific Practice",
      description: "Tailored questions based on your target role and company"
    },
    {
      icon: <Users className="h-8 w-8 text-primary" />,
      title: "Real-time Feedback",
      description: "Get instant feedback on your performance and areas to improve"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-primary">InterviewAI</div>
          <div className="space-x-4">
            {user ? (
              <Button onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button onClick={() => navigate('/login')}>
                  Login
                </Button>
                <Button onClick={() => navigate('/signup')}>
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center space-y-8">
          <h1 className="text-6xl font-bold text-foreground leading-tight">
            Master Your Next
            <br />
            <span className="text-primary">Job Interview</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Practice with AI-powered mock interviews tailored to your dream job. 
            Get real-time feedback and boost your confidence.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Button 
              onClick={handleGetStarted}
              size="lg" 
              className="text-lg px-8 py-4 transition-all duration-300 hover:scale-105"
            >
              Get Started <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32">
          <h2 className="text-4xl font-bold text-center mb-16">Why Choose InterviewAI?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="bg-card p-8 rounded-2xl shadow-lg border border-border transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-4">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-32 text-center bg-primary/5 rounded-3xl p-16">
          <h2 className="text-4xl font-bold mb-6">Ready to Ace Your Interview?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of professionals who have improved their interview skills with InterviewAI
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg" 
            className="text-lg px-8 py-4"
          >
            Start Practicing Now
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
