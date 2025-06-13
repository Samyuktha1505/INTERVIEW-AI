import React from 'react';
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LogOut } from 'lucide-react';
import VoiceSelector from "./VoiceSelector"; // We will include your VoiceSelector

// Define the props the component will receive from ControlTray.tsx
interface SettingsDialogProps {
  onEndWithoutSaving: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ onEndWithoutSaving }) => {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold">Session Settings</DialogTitle>
        <DialogDescription>
          Manage your AI agent's voice here.
        </DialogDescription>
      </DialogHeader>

        {/* Voice Selector from your existing file */}
        <div className="flex flex-col space-y-2">
            <VoiceSelector />
        </div>


    </>
  );
};

export default SettingsDialog;