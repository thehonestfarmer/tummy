export interface NutritionMatch {
  name?: string;
  servingSize?: string;
  servingsPerContainer?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  sugar?: number;
  fiber?: number;
  fat?: number;
  sodium?: number;
}

// Common Thai nutrition label terms and their variations
const THAI_NUTRITION_TERMS = {
  servingSize: ['หนึ่งหน่วยบริโภค', 'ขนาดหนึ่งหน่วยบริโภค'],
  servingsPerContainer: ['จำนวนหน่วยบริโภคต่อ', 'จำนวนหน่วยบริโภคต่อบรรจุภัณฑ์'],
  calories: ['พลังงาน', 'แคลอรี่'],
  protein: ['โปรตีน'],
  carbohydrates: ['คาร์โบไฮเดรต', 'คาร์โบไฮเดรตทั้งหมด'],
  fat: ['ไขมัน', 'ไขมันทั้งหมด'],
  sodium: ['โซเดียม']
};

function extractNumber(text: string): number | undefined {
  const match = text.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : undefined;
}

function findMatchingLine(lines: string[], terms: string[]): string | undefined {
  return lines.find(line => terms.some(term => line.includes(term)));
}

export function parseNutritionText(text: string): NutritionMatch {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const result: NutritionMatch = {};

  // Try to find the product name (usually in the first few lines)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip lines that look like nutrition information
    if (!Object.values(THAI_NUTRITION_TERMS).flat().some(term => line.includes(term))) {
      result.name = line;
      break;
    }
  }

  // Find serving size
  const servingSizeLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.servingSize);
  if (servingSizeLine) {
    result.servingSize = servingSizeLine.split(':').pop()?.trim();
  }

  // Find servings per container
  const servingsPerContainerLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.servingsPerContainer);
  if (servingsPerContainerLine) {
    result.servingsPerContainer = servingsPerContainerLine.split(':').pop()?.trim();
  }

  // Find calories
  const caloriesLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.calories);
  if (caloriesLine) {
    result.calories = extractNumber(caloriesLine);
  }

  // Find protein
  const proteinLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.protein);
  if (proteinLine) {
    result.protein = extractNumber(proteinLine);
  }

  // Find carbohydrates
  const carbsLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.carbohydrates);
  if (carbsLine) {
    result.carbohydrates = extractNumber(carbsLine);
  }

  // Find fat
  const fatLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.fat);
  if (fatLine) {
    result.fat = extractNumber(fatLine);
  }

  // Find sodium
  const sodiumLine = findMatchingLine(lines, THAI_NUTRITION_TERMS.sodium);
  if (sodiumLine) {
    result.sodium = extractNumber(sodiumLine);
  }

  return result;
} 