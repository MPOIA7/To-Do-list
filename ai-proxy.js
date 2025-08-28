// ai-proxy.js - AI Integration with Gemini API
'use strict';

// Gemini API Configuration
const GEMINI_API_KEY = "AIzaSyDBAVMdwmRIdn-Y2x6kDJ5ARx_CbscrsTw";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

/**
 * Split a task into subtasks using Gemini AI
 * @param {string} taskText - The main task text to split
 * @returns {Promise<string[]>} Array of subtask strings
 */
async function aiSplitTask(taskText) {
    try {
        // Prepare the prompt
        const prompt = `
        قم بتقسيم هذه المهمة إلى خطوات فرعية واضحة ومحددة:
        "${taskText}"
        
        المطلوب:
        - قسم المهمة إلى 3-5 خطوات فرعية
        - كل خطوة يجب أن تكون واضحة وقابلة للتنفيذ
        - اكتب كل خطوة في سطر منفصل
        - لا تضع أرقام أو رموز في البداية
        - اكتب باللغة العربية
        - كن مختصراً ومباشراً
        `;

        // Check if we should use real API or mock
        const USE_MOCK = false; // Set to true for testing without API calls
        
        if (USE_MOCK) {
            return await mockAISplit(taskText);
        }

        // Make API request to Gemini
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Extract text from response
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            
            // Parse the response into subtasks
            const subtasks = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .filter(line => !line.startsWith('-')) // Remove bullet points if any
                .map(line => line.replace(/^\d+[\.\-KATEX_INLINE_CLOSE]?\s*/, '')) // Remove numbering if any
                .slice(0, 5); // Limit to 5 subtasks
            
            return subtasks;
        }
        
        throw new Error('Invalid response format');
        
    } catch (error) {
        console.error('AI Split Error:', error);
        
        // Fallback to mock data if API fails
        return await mockAISplit(taskText);
    }
}

/**
 * Mock AI split function for testing/fallback
 * @param {string} taskText - The main task text
 * @returns {Promise<string[]>} Mock subtasks
 */
async function mockAISplit(taskText) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate mock subtasks based on common patterns
    const mockTemplates = {
        'مشروع': [
            'تحديد متطلبات المشروع والأهداف',
            'إنشاء خطة زمنية للتنفيذ',
            'توزيع المهام على الفريق',
            'متابعة التقدم والمراجعة',
            'التسليم النهائي والتقييم'
        ],
        'دراسة': [
            'جمع المواد والمراجع المطلوبة',
            'قراءة وتلخيص النقاط المهمة',
            'حل التمارين والأمثلة',
            'المراجعة النهائية',
            'الاختبار الذاتي'
        ],
        'اجتماع': [
            'تحديد جدول الأعمال',
            'دعوة المشاركين',
            'تحضير العرض التقديمي',
            'إدارة النقاش',
            'توثيق القرارات والمتابعة'
        ],
        'تسوق': [
            'إعداد قائمة المشتريات',
            'تحديد الميزانية المتاحة',
            'البحث عن أفضل الأسعار',
            'الشراء والدفع',
            'التحقق من المشتريات'
        ],
        'رياضة': [
            'الإحماء والتمدد',
            'التمارين الأساسية',
            'التمارين المكثفة',
            'التهدئة والاسترخاء',
            'تسجيل التقدم'
        ],
        'default': [
            'التخطيط والتحضير للمهمة',
            'البدء بالخطوات الأساسية',
            'إكمال الجزء الرئيسي',
            'المراجعة والتحسين',
            'الإنهاء والتوثيق'
        ]
    };
    
    // Find matching template
    let template = mockTemplates.default;
    for (const [key, value] of Object.entries(mockTemplates)) {
        if (taskText.includes(key)) {
            template = value;
            break;
        }
    }
    
    // Customize subtasks based on task text
    return template.map(subtask => {
        if (taskText.length > 20) {
            const keywords = taskText.split(' ').slice(0, 3).join(' ');
            return subtask + ' - ' + keywords;
        }
        return subtask;
    }).slice(0, Math.floor(Math.random() * 2) + 3); // Random 3-5 subtasks
}

/**
 * Get AI suggestions for task optimization
 * @param {Object} task - Task object
 * @returns {Promise<Object>} Suggestions object
 */
async function getAISuggestions(task) {
    try {
        // This could be expanded to provide smart suggestions
        const suggestions = {
            estimatedTime: estimateTaskTime(task.title),
            recommendedPriority: recommendPriority(task),
            tips: generateTips(task)
        };
        
        return suggestions;
    } catch (error) {
        console.error('AI Suggestions Error:', error);
        return null;
    }
}

/**
 * Estimate task completion time
 * @param {string} taskTitle - Task title
 * @returns {number} Estimated minutes
 */
function estimateTaskTime(taskTitle) {
    const keywords = {
        'quick': 15,
        'سريع': 15,
        'بسيط': 20,
        'simple': 20,
        'meeting': 60,
        'اجتماع': 60,
        'project': 180,
        'مشروع': 180,
        'study': 120,
        'دراسة': 120,
        'email': 10,
        'بريد': 10,
        'call': 30,
        'مكالمة': 30
    };
    
    const lowerTitle = taskTitle.toLowerCase();
    for (const [key, time] of Object.entries(keywords)) {
        if (lowerTitle.includes(key)) {
            return time;
        }
    }
    
    // Default based on title length
    return Math.min(30 + taskTitle.length, 120);
}

/**
 * Recommend priority based on task analysis
 * @param {Object} task - Task object
 * @returns {string} Priority level
 */
function recommendPriority(task) {
    const urgentKeywords = ['عاجل', 'urgent', 'مهم', 'important', 'deadline', 'موعد نهائي'];
    const highKeywords = ['مشروع', 'project', 'اجتماع', 'meeting', 'عميل', 'client'];
    
    const title = task.title.toLowerCase();
    
    if (urgentKeywords.some(keyword => title.includes(keyword))) {
        return 'high';
    }
    
    if (highKeywords.some(keyword => title.includes(keyword))) {
        return 'medium';
    }
    
    // Check due date
    if (task.dueDate) {
        const daysUntilDue = Math.floor((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue <= 1) return 'high';
        if (daysUntilDue <= 3) return 'medium';
    }
    
    return 'low';
}

/**
 * Generate smart tips for task completion
 * @param {Object} task - Task object
 * @returns {string[]} Array of tips
 */
function generateTips(task) {
    const tips = [];
    
    // Category-specific tips
    const categoryTips = {
        'work': 'حاول تخصيص وقت خالٍ من المقاطعات لإنجاز هذه المهمة',
        'personal': 'لا تنسَ أن تأخذ وقتك الشخصي بجدية',
        'health': 'الصحة أولوية، احرص على إتمام هذه المهمة',
        'education': 'التعلم استثمار في المستقبل، خصص وقتاً كافياً',
        'shopping': 'قم بإعداد قائمة مسبقة لتوفير الوقت'
    };
    
    if (categoryTips[task.category]) {
        tips.push(categoryTips[task.category]);
    }
    
    // Priority-based tips
    if (task.priority === 'high') {
        tips.push('مهمة ذات أولوية عالية - ابدأ بها أولاً');
    }
    
    // Due date tips
    if (task.dueDate) {
        const hoursUntilDue = Math.floor((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60));
        if (hoursUntilDue <= 24) {
            tips.push('⏰ الموعد النهائي قريب جداً!');
        } else if (hoursUntilDue <= 72) {
            tips.push('📅 تبقى أقل من 3 أيام على الموعد النهائي');
        }
    }
    
    // Time-based tips
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
        tips.push('🌅 الصباح وقت مثالي للمهام التي تحتاج تركيز');
    } else if (hour >= 14 && hour < 17) {
        tips.push('☕ فترة ما بعد الظهر، خذ استراحة قصيرة قبل البدء');
    } else if (hour >= 20) {
        tips.push('🌙 المساء وقت جيد للتخطيط لليوم التالي');
    }
    
    return tips;
}

/**
 * Analyze productivity patterns
 * @param {Array} tasks - Array of tasks
 * @returns {Object} Analytics object
 */
function analyzeProductivity(tasks) {
    const analytics = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.completed).length,
        completionRate: 0,
        averageCompletionTime: 0,
        mostProductiveCategory: '',
        suggestions: []
    };
    
    if (tasks.length > 0) {
        analytics.completionRate = (analytics.completedTasks / analytics.totalTasks * 100).toFixed(1);
        
        // Find most productive category
        const categoryCounts = {};
        tasks.forEach(task => {
            if (task.completed) {
                categoryCounts[task.category] = (categoryCounts[task.category] || 0) + 1;
            }
        });
        
        const maxCategory = Object.entries(categoryCounts).reduce((a, b) => 
            categoryCounts[a[0]] > categoryCounts[b[0]] ? a : b, ['', 0]);
        
        analytics.mostProductiveCategory = maxCategory[0];
        
        // Generate suggestions
        if (analytics.completionRate < 50) {
            analytics.suggestions.push('حاول تقسيم المهام الكبيرة إلى مهام أصغر');
        }
        if (analytics.completionRate > 80) {
            analytics.suggestions.push('أداء ممتاز! استمر على هذا المستوى');
        }
    }
    
    return analytics;
}

// Export functions for use in main app
if (typeof window !== 'undefined') {
    window.aiSplitTask = aiSplitTask;
    window.getAISuggestions = getAISuggestions;
    window.analyzeProductivity = analyzeProductivity;
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        aiSplitTask,
        mockAISplit,
        getAISuggestions,
        estimateTaskTime,
        recommendPriority,
        generateTips,
        analyzeProductivity
    };
}
