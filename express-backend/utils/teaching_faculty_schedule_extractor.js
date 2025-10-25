// teaching_faculty_schedule_extractor.js
const xlsx = require('xlsx');
const path = require('path');

class TeachingFacultyScheduleExtractor {
  constructor() {
    this.dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  }

  /**
   * MAIN EXTRACTION METHOD
   * Universal teaching faculty schedule extraction
   */
  async extractTeachingFacultyScheduleInfo(filename) {
    try {
      // STEP 1: Read Excel file (no headers, raw 2D array)
      const workbook = xlsx.readFile(filename);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      console.log(`📋 Faculty Schedule Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} cols`);

      // STEP 2: Debug - Show raw Excel content
      console.log('📋 Raw Excel content (first 15 rows):');
      for (let i = 0; i < Math.min(15, data.length); i++) {
        const rowData = [];
        for (let j = 0; j < Math.min(data[i].length, 6); j++) {
          if (data[i][j]) {
            rowData.push(`'${data[i][j]}'`);
          } else {
            rowData.push("'N/A'");
          }
        }
        console.log(`   Row ${i}: [${rowData.join(', ')}]`);
      }

      // STEP 3: Extract adviser information
      const adviserInfo = this.extractAdviserInfoFromSchedule(data);
      console.log('📋 Extracted Adviser Info:', adviserInfo);

      // STEP 4: Extract schedule data
      const scheduleData = this.extractScheduleDataFromFacultyExcel(data);
      console.log(`📋 Found ${scheduleData.length} scheduled classes`);

      return {
        adviser_name: adviserInfo.name || 'Unknown Faculty',
        department: adviserInfo.department || 'UNKNOWN',
        schedule: scheduleData
      };

    } catch (error) {
      console.error(`❌ Error in teaching faculty schedule extraction: ${error.message}`);
      return null;
    }
  }

  /**
   * EXTRACT: Adviser name and department from schedule
   */
  extractAdviserInfoFromSchedule(data) {
    const adviserInfo = { name: 'Unknown Faculty', department: 'UNKNOWN' };

    // Search for adviser information in first 20 rows
    for (let i = 0; i < Math.min(20, data.length); i++) {
      for (let j = 0; j < Math.min(data[i].length, 10); j++) {
        if (!data[i][j]) continue;

        const cellValue = String(data[i][j]).trim();
        const cellUpper = cellValue.toUpperCase();

        // LOOK FOR ADVISER NAME
        if (['NAME OF ADVISER', 'ADVISER', 'FACULTY NAME', 'INSTRUCTOR'].some(kw => cellUpper.includes(kw))) {
          let nameValue = null;

          // Check right cell
          if (j + 1 < data[i].length && data[i][j + 1]) {
            const potentialName = String(data[i][j + 1]).trim();
            if (potentialName.length > 3 && 
                !['ADVISER', 'NAME', 'FACULTY'].some(kw => potentialName.toUpperCase().includes(kw))) {
              nameValue = potentialName;
            }
          }

          // Check below cell
          if (!nameValue && i + 1 < data.length && data[i + 1][j]) {
            const potentialName = String(data[i + 1][j]).trim();
            if (potentialName.length > 3) {
              nameValue = potentialName;
            }
          }

          // Check if current cell contains name after colon
          if (!nameValue && cellValue.includes(':')) {
            const parts = cellValue.split(':', 2);
            if (parts.length > 1) {
              const potentialName = parts[1].trim();
              if (potentialName.length > 3) {
                nameValue = potentialName;
              }
            }
          }

          if (nameValue) {
            adviserInfo.name = this.titleCase(nameValue);
            console.log(`🎯 Found adviser name: ${nameValue}`);
          }
        }

        // LOOK FOR DEPARTMENT
        if (['DEPARTMENT', 'COLLEGE', 'DEPT'].some(kw => cellUpper.includes(kw))) {
          let deptValue = null;

          // Check right cell
          if (j + 1 < data[i].length && data[i][j + 1]) {
            const potentialDept = String(data[i][j + 1]).trim();
            if (potentialDept.length > 1) {
              deptValue = potentialDept;
            }
          }

          if (deptValue) {
            adviserInfo.department = deptValue.toUpperCase();
            console.log(`🎯 Found department: ${deptValue}`);
          }
        }
      }
    }

    return adviserInfo;
  }

  /**
   * EXTRACT: Schedule data from faculty Excel
   * Enhanced to capture ALL schedule data including time-only rows
   */
  extractScheduleDataFromFacultyExcel(data) {
    const scheduleData = [];
    
    // Find the schedule table headers
    let scheduleStartRow = -1;
    const dayColumns = {};
    let timeColumn = -1;
    let subjectColumn = -1;
    
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 
                  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    // STEP 1: Find header row
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const rowCells = [];
      for (let j = 0; j < Math.min(data[i].length, 15); j++) {
        if (data[i][j]) {
          rowCells.push(String(data[i][j]).toUpperCase().trim());
        } else {
          rowCells.push('');
        }
      }

      // Check for column headers
      for (let j = 0; j < rowCells.length; j++) {
        const cell = rowCells[j];

        // Find TIME column
        if (cell.includes('TIME') && timeColumn === -1) {
          timeColumn = j;
          console.log(`🕐 Found TIME column at position ${j}`);
        }

        // Find SUBJECT column
        if (['SUBJECT', 'COURSE'].some(kw => cell.includes(kw)) && subjectColumn === -1) {
          subjectColumn = j;
          console.log(`📚 Found SUBJECT column at position ${j}`);
        }

        // Find day columns
        for (const day of days) {
          if (cell.includes(day) && !dayColumns[j]) {
            dayColumns[j] = this.standardizeDayName(day);
            console.log(`📅 Found ${day} column at position ${j}`);
          }
        }
      }

      // If we found headers, next row is data start
      if (Object.keys(dayColumns).length >= 3 && timeColumn >= 0) {
        scheduleStartRow = i + 1;
        console.log(`🎯 Found schedule header at row ${i}, data starts at row ${scheduleStartRow}`);
        break;
      }
    }

    if (scheduleStartRow === -1) {
      console.log('⚠️  Could not find proper schedule table structure');
      return [];
    }

    console.log(`📋 Day columns mapping:`, dayColumns);
    console.log(`📋 Time column: ${timeColumn}, Subject column: ${subjectColumn}`);

    // STEP 2: Build subject lookup (time → subject mapping)
    const subjectLookup = {};

    for (let i = scheduleStartRow; i < data.length; i++) {
      let currentTime = null;
      let currentSubject = null;

      // Get time
      if (timeColumn >= 0 && timeColumn < data[i].length && data[i][timeColumn]) {
        const timeCell = String(data[i][timeColumn]).trim();
        if (timeCell && !['N/A', 'NONE', ''].includes(timeCell.toUpperCase())) {
          currentTime = timeCell;
        }
      }

      // Get subject
      if (subjectColumn >= 0 && subjectColumn < data[i].length && data[i][subjectColumn]) {
        const subjectCell = String(data[i][subjectColumn]).trim();
        if (subjectCell && !['N/A', 'NONE', ''].includes(subjectCell.toUpperCase())) {
          currentSubject = subjectCell;
        }
      }

      // Map time to subject
      if (currentTime && currentSubject) {
        subjectLookup[currentTime] = currentSubject;
        console.log(`🔗 Mapped time '${currentTime}' to subject '${currentSubject}'`);
      }
    }

    console.log(`📋 Built subject lookup with ${Object.keys(subjectLookup).length} time slots`);

    // STEP 3: Extract all schedule entries
    let consecutiveEmptyRows = 0;

    for (let i = scheduleStartRow; i < data.length; i++) {
      // Get the time slot for this row
      let currentTime = null;
      if (timeColumn >= 0 && timeColumn < data[i].length && data[i][timeColumn]) {
        const timeCell = String(data[i][timeColumn]).trim();
        if (timeCell && !['N/A', 'NONE', ''].includes(timeCell.toUpperCase())) {
          currentTime = timeCell;
        }
      }

      // Skip rows without valid time
      if (!currentTime) continue;

      // Get subject from lookup or current row
      let currentSubject = subjectLookup[currentTime];
      if (!currentSubject) {
        // Try to get from current row
        if (subjectColumn >= 0 && subjectColumn < data[i].length && data[i][subjectColumn]) {
          const subjectCell = String(data[i][subjectColumn]).trim();
          if (subjectCell && !['N/A', 'NONE', ''].includes(subjectCell.toUpperCase())) {
            currentSubject = subjectCell;
          }
        }
      }

      // If we still don't have a subject, use a generic one
      if (!currentSubject) {
        currentSubject = `Class at ${currentTime}`;
      }

      // Check each day column for classes
      let foundClassesThisRow = false;
      for (const [colIdx, day] of Object.entries(dayColumns)) {
        const colIndex = parseInt(colIdx);
        if (colIndex < data[i].length && data[i][colIndex]) {
          const classSection = String(data[i][colIndex]).trim();

          // If there's a meaningful entry in this day column
          if (classSection && !['N/A', 'NONE', ''].includes(classSection.toUpperCase())) {
            // Determine the actual subject
            let actualSubject = currentSubject;
            
            if (currentSubject.startsWith('Class at')) {
              // Check if class section matches a known subject
              if (Object.values(subjectLookup).includes(classSection)) {
                actualSubject = classSection;
              } else {
                actualSubject = `Course: ${classSection}`;
              }
            }

            const scheduleEntry = {
              day: day,
              time: currentTime,
              subject: actualSubject,
              section_class: classSection,
              full_description: actualSubject !== classSection 
                ? `${actualSubject} - ${classSection}` 
                : actualSubject
            };

            scheduleData.push(scheduleEntry);
            foundClassesThisRow = true;
            console.log(`📚 Added: ${day} ${currentTime} - ${actualSubject} (Section: ${classSection})`);
          }
        }
      }

      // Track consecutive empty rows
      if (foundClassesThisRow) {
        consecutiveEmptyRows = 0;
      } else {
        consecutiveEmptyRows++;
      }

      // Stop if too many consecutive empty rows
      if (consecutiveEmptyRows >= 8) {
        console.log(`🛑 Stopping after ${consecutiveEmptyRows} consecutive empty rows`);
        break;
      }
    }

    console.log(`📋 Total extracted classes: ${scheduleData.length}`);
    return scheduleData;
  }

  /**
   * TRANSFORM: Standardize day names
   */
  standardizeDayName(day) {
    const dayUpper = day.toUpperCase().trim();
    const dayMap = {
      'MON': 'Monday',
      'MONDAY': 'Monday',
      'TUE': 'Tuesday',
      'TUESDAY': 'Tuesday',
      'WED': 'Wednesday',
      'WEDNESDAY': 'Wednesday',
      'THU': 'Thursday',
      'THURSDAY': 'Thursday',
      'FRI': 'Friday',
      'FRIDAY': 'Friday',
      'SAT': 'Saturday',
      'SATURDAY': 'Saturday'
    };
    return dayMap[dayUpper] || day;
  }

  /**
   * TRANSFORM: Parse time for sorting
   */
  parseTimeForSorting(timeStr) {
    try {
      // Extract first time from range like "08:00 - 08:30"
      let timePart = timeStr.includes(' - ') 
        ? timeStr.split(' - ')[0].trim() 
        : timeStr.trim();

      // Handle different time formats
      if (timePart.includes(':')) {
        const hourMin = timePart.split(':');
        let hour = parseInt(hourMin[0]);
        const minute = parseInt(hourMin[1].slice(0, 2)); // Handle "09:00 AM"

        // Handle 12-hour vs 24-hour format
        // If hour is 1-6, it's likely PM (afternoon) in a work schedule
        if (hour >= 1 && hour <= 6) {
          hour += 12; // Convert to PM
        }

        return hour * 60 + minute;
      } else {
        return 9999; // Put unparseable times at end
      }
    } catch (error) {
      console.log(`⚠️  Error parsing time ${timeStr}: ${error.message}`);
      return 9999;
    }
  }

  /**
   * FORMAT: Create formatted text for display/storage
   */
  formatTeachingFacultySchedule(scheduleInfo) {
    let text = `TEACHING FACULTY CLASS SCHEDULE

FACULTY INFORMATION:
Name of Adviser: ${scheduleInfo.adviser_name || 'Unknown Faculty'}
Department: ${scheduleInfo.department || 'Unknown Department'}

WEEKLY TEACHING SCHEDULE (${scheduleInfo.schedule?.length || 0} scheduled classes):
`;

    if (scheduleInfo.schedule && scheduleInfo.schedule.length > 0) {
      // Group by day
      const byDay = {};
      for (const item of scheduleInfo.schedule) {
        const day = item.day || 'Unknown Day';
        if (!byDay[day]) {
          byDay[day] = [];
        }
        byDay[day].push(item);
      }

      // Display schedule day by day in proper order
      for (const day of this.dayOrder) {
        if (byDay[day]) {
          text += `\n${day.toUpperCase()}:\n`;
          
          // Sort by time
          byDay[day].sort((a, b) => {
            const timeA = this.parseTimeForSorting(a.time || '');
            const timeB = this.parseTimeForSorting(b.time || '');
            return timeA - timeB;
          });

          for (const item of byDay[day]) {
            const timeDisplay = item.time || 'No Time';
            const subjectDisplay = item.subject || 'No Subject';
            const sectionDisplay = item.section_class || '';

            if (sectionDisplay) {
              text += `  • ${timeDisplay} - ${subjectDisplay} (Section: ${sectionDisplay})\n`;
            } else {
              text += `  • ${timeDisplay} - ${subjectDisplay}\n`;
            }
          }
        }
      }

      // Show unique subjects summary
      const uniqueSubjects = {};
      for (const item of scheduleInfo.schedule) {
        const subject = item.subject || '';
        if (subject && !uniqueSubjects[subject]) {
          const sections = new Set();
          for (const s of scheduleInfo.schedule) {
            if (s.subject === subject && s.section_class) {
              sections.add(s.section_class);
            }
          }
          uniqueSubjects[subject] = Array.from(sections);
        }
      }

      if (Object.keys(uniqueSubjects).length > 0) {
        text += `\nSUBJECTS TAUGHT (${Object.keys(uniqueSubjects).length} unique subjects):\n`;
        for (const [subject, sections] of Object.entries(uniqueSubjects).sort()) {
          if (sections.length > 0) {
            text += `• ${subject} (Sections: ${sections.sort().join(', ')})\n`;
          } else {
            text += `• ${subject}\n`;
          }
        }
      }
    } else {
      text += '\nNo schedule data found.';
    }

    return text.trim();
  }

  /**
   * TRANSFORM: Standardize department names
   */
  standardizeDepartmentName(department) {
    if (!department) return 'UNKNOWN';

    const deptUpper = department.toUpperCase().trim();

    // Direct abbreviation match
    const directMatch = {
      'CAS': 'CAS',
      'CCS': 'CCS',
      'IT': 'CCS',
      'CTE': 'CTE',
      'CHTM': 'CHTM',
      'CBA': 'CBA',
      'COE': 'COE',
      'CON': 'CON'
    };

    if (directMatch[deptUpper]) {
      return directMatch[deptUpper];
    }

    // Map full names to abbreviations
    const deptMappings = {
      'COLLEGE OF ARTS & SCIENCES': 'CAS',
      'COLLEGE OF ARTS AND SCIENCES': 'CAS',
      'ARTS AND SCIENCES': 'CAS',
      'MATHEMATICS DEPARTMENT': 'CAS',
      'COLLEGE OF COMPUTER STUDIES': 'CCS',
      'COMPUTER STUDIES': 'CCS',
      'INFORMATION TECHNOLOGY': 'CCS',
      'COLLEGE OF EDUCATION': 'CTE',
      'EDUCATION': 'CTE',
      'COLLEGE OF HOSPITALITY': 'CHTM',
      'HOSPITALITY': 'CHTM',
      'TOURISM': 'CHTM',
      'COLLEGE OF BUSINESS': 'CBA',
      'BUSINESS': 'CBA',
      'OFFICE ADMINISTRATION': 'CBA',
      'COLLEGE OF ENGINEERING': 'COE',
      'ENGINEERING': 'COE',
      'COLLEGE OF NURSING': 'CON',
      'NURSING': 'CON'
    };

    for (const [fullName, abbrev] of Object.entries(deptMappings)) {
      if (deptUpper.includes(fullName)) {
        return abbrev;
      }
    }

    return deptUpper;
  }

  /**
   * HELPER: Title case
   */
  titleCase(str) {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * PROCESS: Main processing method
   */
  async processTeachingFacultyScheduleExcel(filename) {
    try {
      // EXTRACT
      const scheduleInfo = await this.extractTeachingFacultyScheduleInfo(filename);

      if (!scheduleInfo) {
        console.log('❌ Could not extract teaching faculty schedule data from Excel');
        return null;
      }

      // STANDARDIZE DEPARTMENT
      scheduleInfo.department = this.standardizeDepartmentName(scheduleInfo.department);

      // FORMAT
      const formattedText = this.formatTeachingFacultySchedule(scheduleInfo);

      // BUILD METADATA
      const adviserName = scheduleInfo.adviser_name || 'Unknown Faculty';

      // Calculate teaching days
      const daysTeaching = new Set(
        scheduleInfo.schedule.map(item => item.day).filter(day => day)
      ).size;

      const metadata = {
        adviser_name: adviserName,
        full_name: adviserName,
        department: scheduleInfo.department,
        data_type: 'teaching_faculty_schedule',
        faculty_type: 'schedule',
        total_subjects: scheduleInfo.schedule.length,
        days_teaching: daysTeaching,
        source_file: path.basename(filename),
        created_at: new Date()
      };

      console.log('✅ Teaching faculty schedule processing complete');
      console.log(`   👨‍🏫 Faculty: ${adviserName}`);
      console.log(`   🏛️ Department: ${scheduleInfo.department}`);
      console.log(`   📚 Subjects: ${metadata.total_subjects}, Days: ${metadata.days_teaching}`);

      return {
        schedule_info: scheduleInfo,
        formatted_text: formattedText,
        metadata: metadata
      };

    } catch (error) {
      console.error(`❌ Error processing teaching faculty schedule Excel: ${error.message}`);
      return null;
    }
  }
}

module.exports = TeachingFacultyScheduleExtractor;