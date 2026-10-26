/**
 * The shared selection: one picked card, visible to every renderer and to the
 * host. A pick the visitor taps and a pick the host selects from its own
 * inventory UI are the same event.
 */
export type SelectionListener = (id: string | null) => void;

export class Selection {
  private current: string | null = null;
  private readonly listeners = new Set<SelectionListener>();

  public get id(): string | null {
    return this.current;
  }

  public set(id: string | null): void {
    if (id === this.current) {
      return;
    }
    this.current = id;
    for (const l of [...this.listeners]) {
      l(id);
    }
  }

  public subscribe = (l: SelectionListener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}
