import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the survey data
const surveyData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'src', 'data', 'survey_data.json'), 'utf8')
);

// Helper function to format question type
function formatType(type) {
  const typeMap = {
    'text': 'Text Input',
    'textarea': 'Text Area',
    'number': 'Numeric Input',
    'radio': 'Single Choice',
    'checkbox': 'Multiple Choice',
    'select': 'Dropdown',
    'agencies-with-count': 'Agency Selection with Count'
  };
  return typeMap[type] || type;
}

// Generate HTML
function generateHTML() {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${surveyData.title || 'Survey'} - Review Document</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 8px;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        h2 {
            color: #34495e;
            background-color: #ecf0f1;
            padding: 15px;
            border-left: 5px solid #3498db;
            margin-top: 40px;
            margin-bottom: 20px;
        }
        .question {
            margin-bottom: 30px;
            padding: 20px;
            background-color: #fafafa;
            border-radius: 5px;
            border-left: 3px solid #95a5a6;
        }
        .question-header {
            display: flex;
            align-items: baseline;
            gap: 10px;
            margin-bottom: 10px;
        }
        .question-number {
            font-weight: bold;
            color: #3498db;
            font-size: 1.1em;
        }
        .question-text {
            color: #2c3e50;
            font-size: 1.05em;
            flex: 1;
        }
        .required-badge {
            background-color: #e74c3c;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.75em;
            font-weight: bold;
        }
        .question-meta {
            display: flex;
            gap: 20px;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: #7f8c8d;
        }
        .question-type {
            background-color: #3498db;
            color: white;
            padding: 3px 10px;
            border-radius: 3px;
            font-size: 0.85em;
        }
        .options {
            margin-top: 10px;
            padding-left: 20px;
        }
        .option-item {
            padding: 5px 0;
            color: #555;
        }
        .option-item:before {
            content: "○ ";
            color: #3498db;
            font-weight: bold;
        }
        .toc {
            background-color: #ecf0f1;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 30px;
        }
        .toc h3 {
            margin-top: 0;
            color: #2c3e50;
        }
        .toc ul {
            list-style-type: none;
            padding-left: 0;
        }
        .toc li {
            padding: 5px 0;
        }
        .toc a {
            color: #3498db;
            text-decoration: none;
        }
        .toc a:hover {
            text-decoration: underline;
        }
        .stats {
            background-color: #e8f4f8;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #3498db;
        }
        .stat-label {
            font-size: 0.9em;
            color: #7f8c8d;
        }
        @media print {
            body {
                background-color: white;
            }
            .container {
                box-shadow: none;
            }
            .question {
                page-break-inside: avoid;
            }
            h2 {
                page-break-after: avoid;
            }
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #7f8c8d;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${surveyData.title || 'Survey Review'}</h1>
`;

  // Calculate statistics
  let totalQuestions = 0;
  let requiredQuestions = 0;
  surveyData.sections.forEach(section => {
    totalQuestions += section.questions.length;
    requiredQuestions += section.questions.filter(q => q.required).length;
  });

  // Add statistics
  html += `
        <div class="stats">
            <div class="stat-item">
                <span class="stat-number">${surveyData.sections.length}</span>
                <span class="stat-label">Sections</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${totalQuestions}</span>
                <span class="stat-label">Total Questions</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${requiredQuestions}</span>
                <span class="stat-label">Required Questions</span>
            </div>
        </div>
`;

  // Table of Contents
  html += `
        <div class="toc">
            <h3>Table of Contents</h3>
            <ul>
`;
  surveyData.sections.forEach((section, idx) => {
    const sectionId = `section-${idx}`;
    html += `                <li><a href="#${sectionId}">${section.title}</a> (${section.questions.length} questions)</li>\n`;
  });
  html += `            </ul>
        </div>
`;

  // Sections and Questions
  surveyData.sections.forEach((section, sectionIdx) => {
    const sectionId = `section-${sectionIdx}`;
    html += `
        <h2 id="${sectionId}">${section.title}</h2>
`;

    section.questions.forEach(question => {
      html += `
        <div class="question">
            <div class="question-header">
                <span class="question-number">${question.id}.</span>
                <span class="question-text">${question.text}</span>
                ${question.required ? '<span class="required-badge">REQUIRED</span>' : ''}
            </div>
            <div class="question-meta">
                <span class="question-type">${formatType(question.type)}</span>
            </div>
`;

      if (question.options && question.options.length > 0) {
        html += `
            <div class="options">
                <strong>Options:</strong>
`;
        question.options.forEach(option => {
          html += `                <div class="option-item">${option}</div>\n`;
        });
        html += `            </div>
`;
      }

      html += `        </div>
`;
    });
  });

  // Footer
  html += `
        <div class="footer">
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p>Total Questions: ${totalQuestions} | Required: ${requiredQuestions} | Sections: ${surveyData.sections.length}</p>
        </div>
    </div>
</body>
</html>`;

  return html;
}

// Generate Markdown version
function generateMarkdown() {
  let md = `# ${surveyData.title || 'Survey Review'}\n\n`;
  
  // Statistics
  let totalQuestions = 0;
  let requiredQuestions = 0;
  surveyData.sections.forEach(section => {
    totalQuestions += section.questions.length;
    requiredQuestions += section.questions.filter(q => q.required).length;
  });

  md += `**Survey Statistics:**\n`;
  md += `- Sections: ${surveyData.sections.length}\n`;
  md += `- Total Questions: ${totalQuestions}\n`;
  md += `- Required Questions: ${requiredQuestions}\n\n`;
  md += `---\n\n`;

  // Table of Contents
  md += `## Table of Contents\n\n`;
  surveyData.sections.forEach((section, idx) => {
    md += `${idx + 1}. [${section.title}](#${section.title.toLowerCase().replace(/\s+/g, '-')}) (${section.questions.length} questions)\n`;
  });
  md += `\n---\n\n`;

  // Sections and Questions
  surveyData.sections.forEach(section => {
    md += `## ${section.title}\n\n`;

    section.questions.forEach(question => {
      md += `### Question ${question.id}${question.required ? ' ⭐ **(REQUIRED)**' : ''}\n\n`;
      md += `**${question.text}**\n\n`;
      md += `*Type:* ${formatType(question.type)}\n\n`;

      if (question.options && question.options.length > 0) {
        md += `**Options:**\n\n`;
        question.options.forEach(option => {
          md += `- ${option}\n`;
        });
        md += `\n`;
      }

      md += `---\n\n`;
    });
  });

  md += `\n*Generated on ${new Date().toLocaleString()}*\n`;

  return md;
}

// Write files
try {
  const htmlContent = generateHTML();
  const mdContent = generateMarkdown();
  
  const outputDir = path.join(__dirname, 'survey_exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const htmlFile = path.join(outputDir, `survey_review_${timestamp}.html`);
  const mdFile = path.join(outputDir, `survey_review_${timestamp}.md`);

  fs.writeFileSync(htmlFile, htmlContent);
  fs.writeFileSync(mdFile, mdContent);

  console.log('✅ Survey export completed successfully!');
  console.log(`📄 HTML file: ${htmlFile}`);
  console.log(`📝 Markdown file: ${mdFile}`);
  console.log(`\n💡 Tip: Open the HTML file in a browser to view or print to PDF`);
} catch (error) {
  console.error('❌ Error exporting survey:', error.message);
  process.exit(1);
}
