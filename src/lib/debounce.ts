/** Ejecuta `fn` cuando pasan `ms` sin nuevas llamadas (búsqueda: 120 ms). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const envuelta = (...args: A) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  };
  envuelta.cancelar = () => {
    if (t !== undefined) clearTimeout(t);
    t = undefined;
  };
  return envuelta;
}
