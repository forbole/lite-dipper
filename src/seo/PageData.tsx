import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PageSnapshot } from "./page";

const PageDataContext = createContext({
  resources: {} as PageSnapshot["resources"],
  errors: {} as NonNullable<PageSnapshot["errors"]>,
  initialPath: "", initialStatus: 200,
  publish: (_path: string, _data: unknown) => {},
  fail: (_path: string, _status: number, _message: string) => {}
});

export function PageDataProvider({ snapshot, children }: { snapshot?: PageSnapshot; children: ReactNode }) {
  const [resources, setResources] = useState(snapshot?.resources ?? {});
  const [errors, setErrors] = useState(snapshot?.errors ?? {});
  const publish = useCallback((path: string, data: unknown) => {
    setResources((previous) => previous[path] === data ? previous : { ...previous, [path]: data });
    setErrors((previous) => {
      if (!previous[path]) return previous;
      const next = { ...previous }; delete next[path]; return next;
    });
  }, []);
  const fail = useCallback((path: string, status: number, message: string) => {
    setErrors((previous) => ({ ...previous, [path]: { status, message } }));
  }, []);
  const value = useMemo(() => ({ resources, errors, publish, fail, initialPath: snapshot?.path ?? "",
    initialStatus: snapshot?.status ?? 200 }), [resources, errors, publish, fail, snapshot]);
  return <PageDataContext.Provider value={value}>{children}</PageDataContext.Provider>;
}

export function usePageData() { return useContext(PageDataContext); }
