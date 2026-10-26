import { GoogleGenAI } from '@google/genai';
import * as readline from 'readline';
import { calculatePostHoc, calculateAPriori } from './engine.js'; // MCP aracı olarak bunu çağırıyoruz

// API anahtarını doğrudan buraya yapıştır (veya ortam değişkeninden al)
const GEMINI_API_KEY = "BURAYA_KENDI_GEMINI_API_ANAHTARINI_YAZ";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const systemInstruction = `Sen uzman bir tıbbi istatistik ajanısın. Görevin, hekimlerin klinik sorularını okumak ve K4 (chi2-contingency) testi kullanılarak kaç hastaya ihtiyaçları olduğunu hesaplamaktır.
Kullanıcının sorusunu incele ve 'calculate_gpower' aracını uygun w, alpha, power ve df değerleriyle çağır. 
Unutma: K4 testinde hesap senin tarafından YAPILMAZ, her zaman araçtan (motordan) gelen JSON sonucunu kullanıcıya Türkçe ve anlaşılır bir dille sunarsın.`;

async function runAgent() {
  console.log("=========================================");
  console.log("🤖 G*Power K4 Tıbbi Ajanına Hoş Geldiniz");
  console.log("=========================================\n");

  const chat = ai.chats.create({
    model: 'gemini-3.8-flash'
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.1,
      tools: [{
        functionDeclarations: [
          {
            name: "calculate_gpower",
            description: "K4 (chi2-contingency) testi için örneklem büyüklüğü ve güç hesaplar.",
            parameters: {
              type: "OBJECT",
              properties: {
                test: { type: "STRING", description: "chi2-contingency" },
                mode: { type: "STRING", description: "a-priori veya post-hoc" },
                w: { type: "NUMBER" },
                alpha: { type: "NUMBER" },
                df: { type: "NUMBER" },
                power: { type: "NUMBER" },
                n_total: { type: "NUMBER" }
              },
              required: ["test", "mode", "w", "alpha", "df"]
            }
          }
        ]
      }]
    }
  });

  const askQuestion = () => {
    rl.question("\n👨‍⚕️ Hekim: ", async (userInput) => {
      if (userInput.toLowerCase() === 'çıkış') {
        rl.close();
        return;
      }

      console.log("🤖 Ajan düşünüyor...");
      
      try {
        let response = await chat.sendMessage({ message: userInput });
        
        // Ajan aracı çağırmak istiyorsa:
        if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            console.log(`[LOG] MCP Aracı Çağrılıyor: ${call.name}(${JSON.stringify(call.args)})`);
            
            const args = call.args as any;
            let result;
            
            // Adaptör: Çağrıyı yerel motora yönlendir
            if(args.test !== "chi2-contingency") {
                result = { error: "UNSUPPORTED", message: "Bu modül sadece K4'ü destekler." };
            } else if (args.mode === 'a-priori') {
                result = calculateAPriori(args.w, args.alpha, args.power, args.df);
            } else {
                result = calculatePostHoc(args.w, args.alpha, args.n_total, args.df);
            }

            console.log(`[LOG] Motordan Gelen Yanıt: ${JSON.stringify(result)}`);
            
            // Sonucu ajana geri ver
            response = await chat.sendMessage({
                message: [{
                    functionResponse: {
                        name: call.name,
                        response: result
                    }
                }]
            });
        }
        
        console.log(`\n🤖 Ajan Yanıtı: ${response.text}`);
      } catch (e: any) {
        console.error("Hata:", e.message);
      }
      
      askQuestion();
    });
  };

  askQuestion();
}

runAgent();