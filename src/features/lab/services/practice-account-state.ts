import {createContext,useContext} from 'react';
import type {LessonProgress} from './lesson-progress';
import type {MeasurementRecord,PracticeSummary} from './practice-progress';
export type AccountPractice={uid:string;ready:boolean;cloud?:PracticeSummary;records:MeasurementRecord[];steps?:LessonProgress;error:string;localWarning:string};
export const emptyPractice:AccountPractice={uid:'',ready:false,records:[],error:'',localWarning:''};
export const PracticeContext=createContext<AccountPractice>(emptyPractice);
export function useAccountPractice(){return useContext(PracticeContext);}
