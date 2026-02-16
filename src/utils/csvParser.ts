import { v4 as uuidv4 } from 'uuid';
import { formatDate, normalizeDateString } from './functions';
import { LOCAL_ACCOUNT_ID } from './constants';
import { TransactionWithNotes } from './types';

type DescriptionName = 'original_description' | 'name';

/**
 * Parses a CSV text string and converts it to TransactionBase array
 * Handles quoted fields containing commas and escaped quotes properly
 * 
 * @param csvText - The CSV content as a string
 * @param descriptionToUse - Which description field to use ('original_description' or 'name')
 * @returns Array of TransactionBase objects
 */
export const parseCSV = (csvText: string, descriptionToUse: DescriptionName = 'original_description'): TransactionWithNotes[] => {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  const transactions: TransactionWithNotes[] = [];

  if (lines.length === 0) return transactions;

  // Helper function to properly parse CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote within quoted field
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator found outside quotes
        result.push(current.trim());
        current = '';
        i++;
      } else {
        // Regular character
        current += char;
        i++;
      }
    }

    // Add the last field
    result.push(current.trim());
    return result;
  };

  // Parse header row to determine column positions
  const headerRow = parseCSVLine(lines[0]).map(item => item.replace(/"/g, '').toLowerCase());
  const dataLines = lines.slice(1);

  // Find column indices
  const descriptionIndex = headerRow.findIndex(col => 
    col.includes('description') || col.includes('name') || col.includes('memo')
  );
  const categoryIndex = headerRow.findIndex(col => 
    col.includes('category') || col.includes('type')
  );
  const amountIndex = headerRow.findIndex(col => 
    col.includes('amount') || col.includes('value') || col.includes('total')
  );
  const dateIndex = headerRow.findIndex(col => 
    col.includes('date') || col.includes('transaction_date')
  );

  // If required columns are not found, try default order (description, category, amount)
  const hasRequiredColumns = descriptionIndex !== -1 && categoryIndex !== -1 && amountIndex !== -1;
  
  for (const line of dataLines) {
    const columns = parseCSVLine(line).map(item => item.replace(/"/g, ''));
    
    let description, category, amount, date;
    
    if (hasRequiredColumns) {
      description = columns[descriptionIndex];
      category = columns[categoryIndex];
      amount = columns[amountIndex];
      date = dateIndex !== -1 ? columns[dateIndex] : null;
    } else {
      // Fallback to default order (description, category, amount)
      [description, category, amount] = columns;
      date = null;
    }
    
    if (description && category && amount) {
      const parsedAmount = parseFloat(amount) || 0;
      // Invert the amount: negative values become positive, positive values become negative
      // This matches how bank registers typically work
      const invertedAmount = -parsedAmount;
      
      const transaction: TransactionWithNotes = {
        transaction_id: uuidv4(),
        account_id: LOCAL_ACCOUNT_ID,
        date: date ? normalizeDateString(date) : formatDate(new Date()),
        [descriptionToUse]: description,
        category: [category.toLowerCase()],
        amount: invertedAmount,
        iso_currency_code: 'USD',
        unofficial_currency_code: null,
        pending: false,
        notes: undefined,
      } as TransactionWithNotes;
      
      transactions.push(transaction);
    }
  }

  return transactions;
};
