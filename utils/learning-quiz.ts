import type {QuizResult} from '../types/learning.ts';

export async function submitQuizWithRecovery(attemptId:string,answers:Record<string,string>,dependencies:{submit:(id:string,answers:Record<string,string>)=>Promise<QuizResult>;readSession:(id:string)=>Promise<{result:QuizResult|null;answers:Record<string,string>|null}>}):Promise<{result:QuizResult;answers:Record<string,string>}> {
  try{return {result:await dependencies.submit(attemptId,answers),answers};}
  catch {
    try {
      const saved=await dependencies.readSession(attemptId);
      if(saved.result&&saved.answers)return {result:saved.result,answers:saved.answers};
    }catch{/* Keep the attempted answers frozen until the saved result can be confirmed. */}
    throw new Error('Could not confirm the saved quiz result. Retry with these same answers.');
  }
}
