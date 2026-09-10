import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createApi } from './api';
import { createWorkspace, type Workspace, type WorkspaceState } from './state';
import type { ControllerContext, ResumeDraft } from './controller-types';

interface ContextValue {
  store: Workspace;
  state: WorkspaceState;
  draft: React.RefObject<ResumeDraft | null>;
}
const Context = createContext<ContextValue | null>(null);
export function WorkspaceProvider({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace?: Workspace;
}) {
  const [store] = useState(() => workspace || createWorkspace());
  const [state, setState] = useState(store.getState);
  const draft = useRef<ResumeDraft | null>(null);
  useEffect(() => store.subscribe(setState), [store]);
  return <Context.Provider value={{ store, state, draft }}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw Error('WorkspaceProvider is required');
  return value;
}
interface Disposable {
  dispose(): void;
  getDraft?(): ResumeDraft;
}
// Controllers retain their tested transitions. React owns rendering and lifecycle.
export function useController<S, C extends Disposable>(
  connect: (
    context: ControllerContext,
    render: (state: S) => void,
    retained?: ResumeDraft | null,
  ) => C,
  start: (controller: C) => void,
  view?: string,
) {
  const { store, draft } = useWorkspace();
  const [state, setState] = useState<S | null>(null);
  const controller = useRef<C | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const instance = connect(
      { ...store, api: createApi({ signal: abort.signal }), signal: abort.signal, view },
      setState,
      view === 'resume' ? draft.current : null,
    );
    controller.current = instance;
    start(instance);
    return () => {
      if (instance.getDraft) draft.current = instance.getDraft();
      abort.abort();
      instance.dispose();
      controller.current = null;
    };
  }, [connect, start, store, draft, view]);
  return { state, controller };
}
