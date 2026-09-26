import { create } from "zustand";
import { CheckIcon } from "./Icons";

interface ToastState {
  message: string | null;
  variant: "ok" | "err";
  show: (message: string, variant?: "ok" | "err") => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  variant: "ok",
  show: (message, variant = "ok") => {
    set({ message, variant });
    window.setTimeout(() => set({ message: null }), 3200);
  },
}));

export function Toast() {
  const { message, variant } = useToast();
  if (!message) return null;
  return (
    <div className={`toast ${variant === "err" ? "err" : ""}`}>
      {variant === "ok" && <CheckIcon width={16} height={16} />}
      {message}
    </div>
  );
}
