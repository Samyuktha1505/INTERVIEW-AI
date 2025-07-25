import { useCallback, useEffect, useState } from "react";
import Select from "react-select";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";

const voiceOptions = [
  { value: "Puck", label: "Puck" },
  { value: "Charon", label: "Charon" },
  { value: "Kore", label: "Kore" },
  { value: "Fenrir", label: "Fenrir" },
  { value: "Aoede", label: "Aoede" },
];

export default function VoiceSelector() {
  const { config, setConfig } = useLiveAPIContext();

  useEffect(() => {
    const voiceName =
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName ||
      "Atari02";
    const voiceOption = { value: voiceName, label: voiceName };
    setSelectedOption(voiceOption);
  }, [config]);

  const [selectedOption, setSelectedOption] = useState<{
    value: string;
    label: string;
  } | null>(voiceOptions[5]);

  const updateConfig = useCallback(
    (voiceName: string) => {
      setConfig({
        ...config,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      });
    },
    [config, setConfig]
  );

  return (
    <div className="select-group">
      <label htmlFor="voice-selector">Voice</label>
      <Select
        id="voice-selector"
        className="react-select"
        classNamePrefix="react-select"
        styles={{
          control: (baseStyles) => ({
            ...baseStyles,
            background: "var(--Neutral-15)",
            color: "#000", // <-- Ensure black text in the control
            minHeight: "33px",
            maxHeight: "33px",
            border: 0,
          }),
          singleValue: (base) => ({
            ...base,
            color: "#000", // <-- Black text for selected value
          }),
          option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            color: "#000", // <-- Black text for all options
            backgroundColor: isSelected
              ? "#bfdbfe" // <-- Light blue for selected option (Tailwind blue-200)
              : isFocused
              ? "var(--Neutral-30)"
              : undefined,
          }),
        }}
        value={selectedOption}
        defaultValue={selectedOption}
        options={voiceOptions}
        onChange={(e) => {
          setSelectedOption(e);
          if (e) {
            updateConfig(e.value);
          }
        }}
      />
    </div>
  );
}
