/** Stage 3: only the private scheduled refresh context can create/use Gemini. */
import { GoogleGenAI as GoogleGenAISDK } from '@google/genai';
import { inAuthorizedStage3Run, trackedGeminiGenerate } from './stage3Runtime.ts';
export { Type, ThinkingLevel } from '@google/genai';
export const isPaidGeminiEnabled = (): boolean => inAuthorizedStage3Run();
export class GoogleGenAI extends GoogleGenAISDK {
  constructor(options: ConstructorParameters<typeof GoogleGenAISDK>[0]) {
    if (!inAuthorizedStage3Run()) {
      throw new Error('[RMS STAGE 3] Paid Gemini requests are blocked outside the approved daily refresh.');
    }
    super(options);
    const modelApi = this.models as any;
    const original = modelApi.generateContent.bind(modelApi);
    modelApi.generateContent = (params: any) => trackedGeminiGenerate({...params,config:{...params.config,
      httpOptions:{...params.config?.httpOptions,fetch:params.config?.httpOptions?.fetch||options.httpOptions?.fetch}}}, prepared => original(prepared));
  }
}
