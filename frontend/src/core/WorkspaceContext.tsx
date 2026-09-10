import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createApi } from './api';
import { createWorkspace, type Workspace, type WorkspaceState } from './state';
import type { ControllerContext, ResumeDraft } from './controller-types';
import type { JobEditorDraft } from '../modules/jobs/draft';

interface ContextValue {
  store: Workspace;
  state: WorkspaceState;
  draft: React.RefObject<ResumeDraft | null>;
  jobDraft: React.RefObject<JobEditorDraft | null>;
  jobLibrary: NonNullable<ControllerContext['jobLibrary']>;
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
  const jobDraft = useRef<JobEditorDraft | null>(null);
  const jobLibrary = useRef<NonNullable<ControllerContext['jobLibrary']>['current']>(null);
  useEffect(() => store.subscribe(setState), [store]);
  return (
    <Context.Provider value={{ store, state, draft, jobDraft, jobLibrary }}>
      {children}
    </Context.Provider>
  );
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
  const { store, draft, jobLibrary } = useWorkspace();
  const [state, setState] = useState<S | null>(null);
  const controller = useRef<C | null>(null);
  useLayoutEffect(() => {
    const abort = new AbortController();
    const instance = connect(
      {
        ...store,
        api: createApi({ signal: abort.signal }),
        signal: abort.signal,
        view,
        jobLibrary,
      },
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
  }, [connect, start, store, draft, view, jobLibrary]);
  return { state, controller };
}
