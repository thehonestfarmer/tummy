import translate from 'translate';

// Configure translate to use Google
translate.engine = 'google';

export async function translateText(text: string): Promise<string> {
  try {
    // Split text into smaller chunks to avoid length limits
    const chunks = text.split('\n').filter(Boolean);
    console.log('Original text chunks:', chunks);

    const translatedChunks = await Promise.all(
      chunks.map(async chunk => {
        try {
          const response = await fetch('/api/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk }),
          });

          if (!response.ok) {
            throw new Error(`Translation failed: ${response.statusText}`);
          }

          const data = await response.json();
          console.log('Translation result:', {
            original: chunk,
            translated: data.translatedText
          });
          return data.translatedText;
        } catch (error) {
          console.error('Chunk translation error:', error);
          return chunk; // Return original chunk if translation fails
        }
      })
    );

    const result = translatedChunks.join('\n');
    console.log('Final translation:', {
      original: text,
      translated: result
    });
    return result;
  } catch (error) {
    console.error('Translation error:', error);
    return text; // Return original text if translation fails
  }
} 