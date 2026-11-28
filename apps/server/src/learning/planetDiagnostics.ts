import { AIError } from '../ai/catalog';

type PlanetFailureDiagnostic = {
  stage:'structure'|'content-review';
  reason:string;
  attempt?:1|2;
  phase?:'initial'|'format-repair';
  problems?:{path:(string|number)[];code:string}[];
  shape?:{regions:number|null;questions:(number|null)[];graphNodes:number|null;graphEdges:number|null};
};

/** Only fixed categories, schema paths and counts; never model content or provider errors. */
export class PlanetDiagnosticError extends AIError {
  constructor(code:string,message:string,status:number,readonly diagnostic:PlanetFailureDiagnostic){super(code,message,status);}
}

export function diagnosticForJob(error:unknown){
  return error instanceof PlanetDiagnosticError?error.diagnostic:undefined;
}
