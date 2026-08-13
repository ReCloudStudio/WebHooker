export interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "bad";
}

export function useToasts() {
  const toasts = useState<Toast[]>("app-toasts", () => []);

  function push(msg: string, kind: "ok" | "bad" = "ok"): void {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    toasts.value.push({ id, msg, kind });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 2600);
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, dismiss };
}
