// curriculum_extractor.js
const xlsx = require('xlsx');
const fs = require('fs');

class CurriculumExtractor {
  constructor() {
    // Department keyword patterns for intelligent detection
    this.departmentKeywords = {
      'CCS': ['COMPUTER', 'INFORMATION TECHNOLOGY', 'IT', 'INFORMATION SYSTEMS', 'SOFTWARE', 'PROGRAMMING', 'DATA'],
      'CHTM': ['HOSPITALITY', 'HOTEL', 'TOURISM', 'TRAVEL', 'RESTAURANT', 'CULINARY'],
      'CBA': ['BUSINESS', 'ADMINISTRATION', 'MANAGEMENT', 'ACCOUNTANCY', 'ACCOUNTING', 'OFFICE', 'ENTREPRENEURSHIP', 'MARKETING', 'FINANCE'],
      'CTE': ['EDUCATION', 'TEACHING', 'TEACHER', 'ELEMENTARY', 'SECONDARY'],
      'COE': ['ENGINEERING', 'CIVIL', 'ELECTRICAL', 'MECHANICAL', 'ELECTRONICS', 'INDUSTRIAL'],
      'CON': ['NURSING', 'NURSE', 'MIDWIFERY', 'HEALTH'],
      'CAS': ['ARTS', 'SCIENCES', 'LIBERAL', 'HUMANITIES', 'SOCIAL', 'PSYCHOLOGY', 'BIOLOGY', 'CHEMISTRY', 'PHYSICS', 'MATHEMATICS', 'COMMUNICATION']
    };
  }

  /**
   * Main function to process curriculum Excel file
   */
  async processCurriculumExcel(filePath) {
    try {
      console.log(`\n📚 Processing curriculum file: ${filePath}`);
      
      // Read the Excel file
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to array of arrays for easier processing
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      
      console.log(`📋 Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} columns`);
      
      // Extract metadata (program, department, year)
      const metadata = this.extractMetadata(data, filePath);
      console.log(`📋 Metadata:`, metadata);
      
      // Extract subjects/curriculum data
      const subjects = this.extractSubjects(data);
      console.log(`📋 Found ${subjects.length} subjects`);
      
      // Organize curriculum by year and semester
      const organizedCurriculum = this.organizeCurriculum(subjects);
      
      // Format the output
      const result = {
        metadata: {
          program: metadata.program,
          course: metadata.program, // Same as program for consistency
          department: metadata.department,
          effective_year: metadata.effective_year || new Date().getFullYear(),
          curriculum_year: metadata.curriculum_year || 'Not specified',
          revision: metadata.revision || '1.0',
          total_subjects: subjects.length,
          source_file: filePath.split(/[/\\]/).pop(),
          created_at: new Date()
        },
        curriculum_data: {
          curriculum: organizedCurriculum,
          all_subjects: subjects
        },
        formatted_text: this.formatCurriculumText(organizedCurriculum, metadata)
      };
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing curriculum Excel: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract metadata from Excel file
   */
  extractMetadata(data, filePath) {
    const metadata = {
      program: '',
      department: '',
      effective_year: null,
      curriculum_year: '',
      revision: '1.0'
    };
    
    // Search first 20 rows for metadata
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      for (let j = 0; j < Math.min(10, row.length); j++) {
        if (!row[j]) continue;
        
        const cellValue = String(row[j]).trim();
        const cellUpper = cellValue.toUpperCase();
        
        // Look for program/course information
        if (cellUpper.includes('COURSE:') || cellUpper.includes('PROGRAM:') || cellUpper.includes('DEGREE:')) {
          let programValue = null;
          
          // Check next 5 cells for the actual program (handles merged cells and gaps)
          for (let k = j + 1; k < Math.min(j + 6, row.length); k++) {
            if (row[k]) {
              const potentialProgram = String(row[k]).trim();
              if (potentialProgram.length > 5 && !potentialProgram.match(/^\d+$/)) {
                programValue = potentialProgram;
                break;
              }
            }
          }
          
          // Check if current cell contains program after colon
          if (!programValue && cellValue.includes(':')) {
            const parts = cellValue.split(':');
            if (parts.length > 1) {
              programValue = parts[1].trim();
            }
          }
          
          if (programValue && programValue.length > 3) {
            metadata.program = this.extractCourseCode(programValue);
            console.log(`🎯 Found program: ${programValue} -> ${metadata.program}`);
          }
        }
        
        // Look for year information
        if (cellUpper.includes('YEAR LEVEL:') || cellUpper.includes('YEAR:')) {
          let yearValue = null;
          
          if (j + 1 < row.length && row[j + 1]) {
            yearValue = String(row[j + 1]).trim();
          }
          
          if (!yearValue && cellValue.includes(':')) {
            const parts = cellValue.split(':');
            if (parts.length > 1) {
              yearValue = parts[1].trim();
            }
          }
          
          if (yearValue) {
            metadata.curriculum_year = yearValue;
            console.log(`🎯 Found year: ${yearValue}`);
          }
        }
        
        // Look for effective year
        if (cellUpper.includes('EFFECTIVE') && cellUpper.includes('YEAR')) {
          const yearMatch = cellValue.match(/\b(20\d{2})\b/);
          if (yearMatch) {
            metadata.effective_year = parseInt(yearMatch[1]);
            console.log(`🎯 Found effective year: ${metadata.effective_year}`);
          }
        }
      }
    }
    
    // Infer department from program
    if (metadata.program) {
      // Find the original program text for better department detection
      let fullProgramText = '';
      for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let j = 0; j < Math.min(15, row.length); j++) {
          if (!row[j]) continue;
          const cellValue = String(row[j]).trim();
          const cellUpper = cellValue.toUpperCase();
          
          if (cellUpper.includes('COURSE:') || cellUpper.includes('PROGRAM:')) {
            // Check next 5 cells for the full program name
            for (let k = j + 1; k < Math.min(j + 6, row.length); k++) {
              if (row[k]) {
                const potential = String(row[k]).trim();
                if (potential.length > 5 && !potential.match(/^\d+$/)) {
                  fullProgramText = potential;
                  break;
                }
              }
            }
            
            // Also check if current cell contains program after colon
            if (!fullProgramText && cellValue.includes(':')) {
              const parts = cellValue.split(':');
              if (parts.length > 1 && parts[1].trim().length > 5) {
                fullProgramText = parts[1].trim();
              }
            }
            
            if (fullProgramText) break;
          }
        }
        if (fullProgramText) break;
      }
      
      // Use full program text for detection, fallback to acronym
      const detectFrom = fullProgramText || metadata.program;
      metadata.department = this.detectDepartment(detectFrom);
      console.log(`🎯 Inferred department: ${metadata.department} (from: "${detectFrom}")`);
    }
    
    // Fallback: extract from filename
    if (!metadata.program) {
      const fileProgram = this.extractCourseFromFilename(filePath);
      if (fileProgram) {
        metadata.program = fileProgram;
        metadata.department = this.detectDepartment(fileProgram);
        console.log(`🎯 Inferred program from filename: ${fileProgram}`);
      }
    }
    
    return metadata;
  }

  /**
   * Extract course code from program name - UNIVERSAL APPROACH
   */
  extractCourseCode(programName) {
    if (!programName) return 'UNKNOWN';
    
    const upper = programName.toUpperCase().trim();
    
    // Pattern 1: Extract existing acronym if already present (e.g., "BSCS", "BSIT")
    const acronymMatch = upper.match(/\b(BS[A-Z]{1,4}|AB[A-Z]{0,3}|BA[A-Z]{0,3})\b/);
    if (acronymMatch) {
      return acronymMatch[1];
    }
    
    // Pattern 2: "BS in [Program]" or "Bachelor of Science in [Program]"
    const bsInMatch = upper.match(/(?:BACHELOR OF SCIENCE|BS)(?:\s+IN)?\s+(.+?)(?:\s*\(|$)/);
    if (bsInMatch) {
      const program = bsInMatch[1].trim();
      // Create acronym from the program name
      const words = program.split(/\s+/).filter(w => 
        w.length > 2 && !['AND', 'THE', 'OF', 'IN', 'WITH'].includes(w)
      );
      
      if (words.length === 1) {
        // Single word: take first 2-4 letters
        return 'BS' + words[0].substring(0, Math.min(4, words[0].length));
      } else if (words.length > 1) {
        // Multiple words: take first letter of each
        return 'BS' + words.map(w => w[0]).join('');
      }
    }
    
    // Pattern 3: "AB in [Program]" or "Bachelor of Arts in [Program]"
    const abInMatch = upper.match(/(?:BACHELOR OF ARTS|AB)(?:\s+IN)?\s+(.+?)(?:\s*\(|$)/);
    if (abInMatch) {
      const program = abInMatch[1].trim();
      const words = program.split(/\s+/).filter(w => 
        w.length > 2 && !['AND', 'THE', 'OF', 'IN', 'WITH'].includes(w)
      );
      
      if (words.length === 1) {
        return 'AB' + words[0].substring(0, Math.min(4, words[0].length));
      } else if (words.length > 1) {
        return 'AB' + words.map(w => w[0]).join('');
      }
    }
    
    // Pattern 4: Just return the cleaned program name as-is
    return upper.replace(/[^A-Z0-9]/g, '').substring(0, 10);
  }

  /**
   * Extract course code from filename - UNIVERSAL APPROACH
   */
  extractCourseFromFilename(filePath) {
    if (!filePath) return null;
    
    const filename = filePath.split(/[/\\]/).pop().toUpperCase();
    
    // Pattern 1: Look for BS/AB/BA followed by letters (e.g., BSCS, BSIT, BSHM)
    const degreeMatch = filename.match(/\b(BS|AB|BA)[A-Z]{1,4}\b/);
    if (degreeMatch) {
      return degreeMatch[1];
    }
    
    // Pattern 2: Look for common degree abbreviations
    const commonMatch = filename.match(/\b(BSCS|BSIT|BSIS|BSHM|BSTM|BSBA|BSA|BSOA|BSED|BEED|BSCE|BSEE|BSN|ABCOM|ABPSYCH)\b/);
    if (commonMatch) {
      return commonMatch[1];
    }
    
    // Pattern 3: Extract from "BS_XXX" or "BS-XXX" patterns
    const underscoreMatch = filename.match(/BS[_-]([A-Z]{2,4})/);
    if (underscoreMatch) {
      return 'BS' + underscoreMatch[1];
    }
    
    return null;
  }

  /**
   * Detect department from course code or program name - UNIVERSAL APPROACH
   */
  detectDepartment(courseCodeOrProgram) {
    if (!courseCodeOrProgram) return 'UNKNOWN';
    
    const upper = courseCodeOrProgram.toUpperCase();
    
    // Score each department based on keyword matches
    const scores = {};
    
    for (const [dept, keywords] of Object.entries(this.departmentKeywords)) {
      scores[dept] = 0;
      
      for (const keyword of keywords) {
        if (upper.includes(keyword)) {
          // Longer keywords get higher score (more specific)
          scores[dept] += keyword.length;
        }
      }
    }
    
    // Find department with highest score
    let bestDept = 'UNKNOWN';
    let bestScore = 0;
    
    for (const [dept, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestDept = dept;
      }
    }
    
    // If no keywords matched, try to infer from course prefix
    if (bestScore === 0) {
      // Check if it starts with department-like prefix
      if (upper.match(/^(CS|IT|IS)/)) return 'CCS';
      if (upper.match(/^(HM|TM|HRM)/)) return 'CHTM';
      if (upper.match(/^(BA|BS|ACC|FIN|MGT|MKT|OA)/)) return 'CBA';
      if (upper.match(/^(ED|BSED|BEED)/)) return 'CTE';
      if (upper.match(/^(CE|EE|ME|IE)/)) return 'COE';
      if (upper.match(/^(NS|NUR)/)) return 'CON';
    }
    
    return bestDept;
  }

  /**
   * Extract subjects from Excel data - ENHANCED UNIVERSAL VERSION
   */
  extractSubjects(data) {
    const subjects = [];
    
    // Find header row
    let headerRow = -1;
    const columnMapping = {};
    
    const fieldMappings = {
      'year_level': ['YEAR LEVEL', 'YEAR', 'YR', 'LEVEL', 'YR LEVEL'],
      'semester': ['SEMESTER', 'SEM', 'TERM', 'PERIOD'],
      'subject_code': ['SUBJECT CODE', 'COURSE CODE', 'CODE', 'SUBJ CODE', 'SUBJ. CODE'],
      'subject_name': ['SUBJECT NAME', 'COURSE NAME', 'SUBJECT', 'COURSE TITLE', 'DESCRIPTION', 'TITLE', 'SUBJECT DESCRIPTION', 'SUBJ DESCRIPTION'],
      'type': ['TYPE', 'CATEGORY', 'CLASSIFICATION', 'KIND'],
      'hours_per_week': ['HOURS/WEEK', 'HOURS PER WEEK', 'HOURS', 'HRS/WK', 'CONTACT HOURS'],
      'units': ['UNITS', 'CREDITS', 'CREDIT UNITS', 'CR', 'UNIT']
    };
    
    // Search for header row
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      const rowText = row.map(cell => cell ? String(cell).toUpperCase() : '').join(' ');
      
      let headerCount = 0;
      for (const [field, possibleHeaders] of Object.entries(fieldMappings)) {
        for (const header of possibleHeaders) {
          if (rowText.includes(header)) {
            headerCount++;
            break;
          }
        }
      }
      
      if (headerCount >= 3) { // Reduced from 4 to 3 for more flexibility
        headerRow = i;
        console.log(`📋 Found header row at index ${i}`);
        break;
      }
    }
    
    if (headerRow === -1) {
      console.log('⚠️  Could not find header row');
      return subjects;
    }
    
    // Map columns
    const headerCells = [];
    const headerRowData = data[headerRow];
    for (let j = 0; j < headerRowData.length; j++) {
      if (headerRowData[j]) {
        headerCells.push([j, String(headerRowData[j]).toUpperCase().trim()]);
      }
    }
    
    console.log(`📋 Header cells:`, headerCells.map(([idx, text]) => `${idx}:${text}`));
    
    // Map each field to best matching column
    for (const [field, possibleHeaders] of Object.entries(fieldMappings)) {
      let bestMatch = null;
      let bestScore = 0;
      
      for (const [colIdx, headerText] of headerCells) {
        for (const possibleHeader of possibleHeaders) {
          if (headerText.includes(possibleHeader)) {
            const score = headerText === possibleHeader ? possibleHeader.length : possibleHeader.length - 1;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = colIdx;
            }
          }
        }
      }
      
      if (bestMatch !== null) {
        columnMapping[field] = bestMatch;
        console.log(`🎯 Mapped ${field} to column ${bestMatch}`);
      }
    }
    
    // Extract subject data with year/semester inheritance
    let currentYear = '1';
    let currentSemester = '1st Semester';
    
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      
      // Skip empty rows
      if (row.every(cell => !cell)) continue;
      
      // Check for year level in year column
      if (columnMapping.year_level !== undefined) {
        const yearCell = row[columnMapping.year_level];
        if (yearCell) {
          const yearStr = String(yearCell).trim();
          // Match patterns like "1st", "2nd", "3rd", "4th" or just "1", "2", "3", "4"
          const yearMatch = yearStr.match(/^(\d+)(?:st|nd|rd|th)?$/i);
          if (yearMatch) {
            currentYear = yearMatch[1];
            console.log(`📍 Year level changed to: ${currentYear}`);
          }
        }
      }
      
      // Check for semester markers in term/semester column
      if (columnMapping.semester !== undefined) {
        const semCell = row[columnMapping.semester];
        if (semCell) {
          const semStr = String(semCell).toUpperCase().trim();
          if (semStr.match(/^(1ST|FIRST|1)$/)) {
            currentSemester = '1st Semester';
            console.log(`📍 Semester changed to: ${currentSemester}`);
          } else if (semStr.match(/^(2ND|SECOND|2)$/)) {
            currentSemester = '2nd Semester';
            console.log(`📍 Semester changed to: ${currentSemester}`);
          } else if (semStr.match(/^(SUM|SUMMER|MID)$/i)) {
            currentSemester = 'Summer';
            console.log(`📍 Semester changed to: ${currentSemester}`);
          }
        }
      }
      
      // Skip footer/summary rows
      const subjectCodeCell = columnMapping.subject_code !== undefined ? row[columnMapping.subject_code] : '';
      const subjectCodeStr = String(subjectCodeCell || '').toUpperCase().trim();
      
      if (['TOTAL', 'SUMMARY', 'NOTE', 'LEGEND', 'GRAND TOTAL'].some(keyword => subjectCodeStr.includes(keyword))) {
        continue;
      }
      
      // Skip rows that only contain totals/numbers (likely summary rows)
      if (subjectCodeStr && subjectCodeStr.match(/^\d+$/) && parseInt(subjectCodeStr) > 20) {
        continue;
      }
      
      // Extract subject entry
      const subjectEntry = {};
      let isValid = false;
      
      for (const [field, colIdx] of Object.entries(columnMapping)) {
        if (colIdx < row.length && row[colIdx]) {
          const value = String(row[colIdx]).trim();
          if (value && !['N/A', 'NONE', 'TBA', 'TBD'].includes(value.toUpperCase())) {
            const cleanedValue = this.cleanValue(value, field);
            if (cleanedValue) {
              subjectEntry[field] = cleanedValue;
              if (field === 'subject_code' || field === 'subject_name') {
                isValid = true;
              }
            }
          }
        }
      }
      
      // Use inherited year and semester
      subjectEntry.year_level = currentYear;
      subjectEntry.semester = currentSemester;
      
      // Set defaults for missing fields
      const defaults = {
        'subject_code': 'N/A',
        'subject_name': 'Unknown Subject',
        'type': 'Core',
        'hours_per_week': '3',
        'units': '3'
      };
      
      for (const [field, defaultValue] of Object.entries(defaults)) {
        if (!subjectEntry[field]) {
          subjectEntry[field] = defaultValue;
        }
      }
      
      // Add if valid
      if (isValid && (subjectEntry.subject_code || subjectEntry.subject_name)) {
        // Skip if this looks like a duplicate summary line
        const isDuplicate = subjects.some(s => 
          s.subject_code === subjectEntry.subject_code && 
          s.year_level === subjectEntry.year_level &&
          s.semester === subjectEntry.semester
        );
        
        if (!isDuplicate) {
          subjects.push(subjectEntry);
          console.log(`📚 Added: ${subjectEntry.subject_code} - ${subjectEntry.subject_name} (Year ${subjectEntry.year_level}, ${subjectEntry.semester})`);
        }
      }
    }
    
    return subjects;
  }

  /**
   * Clean field value
   */
  cleanValue(value, fieldType) {
    if (!value || value.trim().length === 0) return null;
    
    value = value.trim();
    
    switch (fieldType) {
      case 'subject_name':
        if (value.length > 1 && !['N/A', 'NONE', 'TBA', 'TBD'].includes(value.toUpperCase())) {
          return value.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
        return null;
        
      case 'subject_code':
        const cleaned = value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
        return cleaned.length >= 2 ? cleaned : null;
        
      case 'semester':
        const upper = value.toUpperCase();
        if (['1ST', 'FIRST', '1'].some(term => upper.includes(term))) {
          return '1st Semester';
        } else if (['2ND', 'SECOND', '2'].some(term => upper.includes(term))) {
          return '2nd Semester';
        } else if (['SUMMER', 'SUM', 'MID'].some(term => upper.includes(term))) {
          return 'Summer';
        }
        return value.trim();
        
      case 'type':
        const typeUpper = value.toUpperCase();
        if (['MAJOR', 'CORE', 'PROFESSIONAL'].some(term => typeUpper.includes(term))) {
          return 'Major';
        } else if (['MINOR', 'ELECTIVE'].some(term => typeUpper.includes(term))) {
          return 'Elective';
        } else if (['GEN', 'GENERAL', 'EDUCATION'].some(term => typeUpper.includes(term))) {
          return 'General Education';
        } else if (['LAB', 'LABORATORY'].some(term => typeUpper.includes(term))) {
          return 'Laboratory';
        } else if (typeUpper.includes('PE')) {
          return 'Physical Education';
        } else if (typeUpper.includes('NSTP')) {
          return 'NSTP';
        }
        return value.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
      case 'year_level':
        const yearMatch = value.match(/([1-4])/);
        return yearMatch ? yearMatch[1] : '1';
        
      case 'hours_per_week':
      case 'units':
        const numMatch = value.match(/(\d+(?:\.\d+)?)/);
        return numMatch ? numMatch[1] : '3';
        
      default:
        return value;
    }
  }

  /**
   * Organize curriculum by year and semester
   */
  organizeCurriculum(subjects) {
    const organized = {};
    
    for (const subject of subjects) {
      const year = subject.year_level || '1';
      const semester = subject.semester || '1st Semester';
      
      if (!organized[year]) {
        organized[year] = {};
      }
      
      if (!organized[year][semester]) {
        organized[year][semester] = [];
      }
      
      organized[year][semester].push(subject);
    }
    
    return organized;
  }

  /**
   * Format curriculum as readable text
   */
  formatCurriculumText(curriculum, metadata) {
    let text = '';
    
    text += '='.repeat(60) + '\n';
    text += `CURRICULUM: ${metadata.program}\n`;
    text += `DEPARTMENT: ${metadata.department}\n`;
    if (metadata.effective_year) {
      text += `EFFECTIVE YEAR: ${metadata.effective_year}\n`;
    }
    text += '='.repeat(60) + '\n\n';
    
    const years = Object.keys(curriculum).sort();
    
    for (const year of years) {
      text += `\nYEAR ${year}\n`;
      text += '-'.repeat(60) + '\n';
      
      const semesters = Object.keys(curriculum[year]);
      
      for (const semester of semesters) {
        text += `\n${semester}:\n`;
        
        const subjects = curriculum[year][semester];
        
        for (const subject of subjects) {
          text += `  ${subject.subject_code.padEnd(12)} | ${subject.subject_name.padEnd(40)} | ${subject.units} units\n`;
        }
      }
    }
    
    return text;
  }
}

module.exports = CurriculumExtractor;