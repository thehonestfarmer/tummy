import { NextResponse } from 'next/server';
import translate from 'translate';

translate.engine = 'google';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const translatedText = await translate(text, { from: 'th', to: 'en' });
    return NextResponse.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 