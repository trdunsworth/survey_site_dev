import { useEffect, useState, useRef } from 'react';
import { Observable, Subject } from 'rxjs';

/**
 * Hook to subscribe to an RxJS Observable and get its latest value
 * Automatically handles subscription cleanup
 */
export function useObservable<T>(
  observable$: Observable<T>,
  initialValue: T
): T {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const subscription = observable$.subscribe({
      next: (val) => setValue(val),
      error: (err) => console.error('Observable error:', err),
    });

    return () => subscription.unsubscribe();
  }, [observable$]);

  return value;
}

/**
 * Hook to create and manage a Subject
 * Returns a stable reference to the Subject that won't change between renders
 */
export function useSubject<T>(): Subject<T> {
  const subjectRef = useRef<Subject<T>>();

  if (!subjectRef.current) {
    subjectRef.current = new Subject<T>();
  }

  useEffect(() => {
    const subject = subjectRef.current;
    return () => {
      subject?.complete();
    };
  }, []);

  return subjectRef.current;
}

/**
 * Hook to subscribe to an Observable and trigger side effects
 * Useful for subscribing to streams without needing to read their values
 */
export function useSubscription<T>(
  observable$: Observable<T> | null,
  next?: (value: T) => void,
  error?: (error: any) => void,
  complete?: () => void
): void {
  useEffect(() => {
    if (!observable$) return;

    const subscription = observable$.subscribe({
      next,
      error: error || ((err) => console.error('Subscription error:', err)),
      complete,
    });

    return () => subscription.unsubscribe();
  }, [observable$, next, error, complete]);
}
