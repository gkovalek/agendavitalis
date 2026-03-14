

## Plan: Fix `dias_trabajo` to use Spanish day names instead of numbers

### Problem
The `dias_trabajo` column expects an array of Spanish day name strings (`['lunes', 'martes', ...]`), but the code currently stores/processes them as numbers (`[1, 2, 3, ...]`).

### Changes

**1. `src/lib/constants.ts`** — Replace `normalizeDiasTrabajo` to work with strings instead of numbers. Add a mapping constant and update the return type to `string[]`.

```ts
const DIAS_MAP: Record<number, string> = {
  1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves',
  5: 'viernes', 6: 'sabado', 7: 'domingo'
};

const DIAS_REVERSE: Record<string, number> = Object.fromEntries(
  Object.entries(DIAS_MAP).map(([k, v]) => [v, Number(k)])
);

export const normalizeDiasTrabajo = (dias: unknown): string[] => {
  if (!Array.isArray(dias)) return [];
  return [...new Set(dias.map(d => typeof d === 'string' ? d.toLowerCase() : DIAS_MAP[Number(d)])
    .filter((d): d is string => !!d && Object.values(DIAS_MAP).includes(d)))];
};

export const diasToNumbers = (dias: string[]): number[] => {
  return dias.map(d => DIAS_REVERSE[d]).filter(Boolean).sort((a, b) => a - b);
};
```

**2. `src/components/InlineServiciosHorarios.tsx`** — Update `InlineServicioAsignado.dias_trabajo` type from `number[]` to `string[]`. Update checkbox logic to use string day names and the new constants.

**3. `src/components/ServiciosHorariosTab.tsx`** — Same: update `DIAS_SEMANA` to use string values, update checkbox/display logic.

**4. `src/pages/Profesionales.tsx`** — The `saveInlineServicios` already uses `normalizeDiasTrabajo` which will now return strings. The delete-before-insert logic is already present. No structural changes needed beyond type alignment.

**5. `src/pages/Equipos.tsx`** — Same as Profesionales, type alignment only.

**6. `src/pages/Dashboard.tsx`** — Update `availabilityMap` to compare `dias_trabajo` strings against the current day name instead of `dayOfWeek` number. Use a helper to get today's Spanish day name from `getDay()`.

### Summary
- All `dias_trabajo` values become `string[]` of Spanish day names throughout the app
- `normalizeDiasTrabajo` handles both legacy number input and string input gracefully
- Delete-before-insert already implemented in both Profesionales and Equipos
- Dashboard availability check uses string day comparison

