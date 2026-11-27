// Imports a package that is ES modules only (`exports` with just `import`), and one of its subpaths.
import { roll } from "esm-only";
import { twice } from "esm-only/extra";
export const generate = (seed: number) => ({ value: twice(roll(seed)) });
export const evaluate = (level: { value: number }) => ({ solvable: level.value % 2 === 0, metrics: { value: level.value } });
