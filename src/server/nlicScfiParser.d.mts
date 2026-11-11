export interface NlicScfiObservation { date: string; scfi: number; }
export declare function parseNlicScfiTable(html:string,now?:Date):NlicScfiObservation[];
