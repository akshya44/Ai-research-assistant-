import React, { useState, useRef, useEffect } from 'react';

const CATEGORY_COLORS = {
  academic: { bg: 'rgba(147, 51, 234, 0.1)', text: '#9333ea', border: '#e9d5ff' }, // purple
  professional: { bg: 'rgba(13, 148, 136, 0.1)', text: '#0d9488', border: '#ccfbf1' }, // teal
  personal: { bg: 'rgba(217, 119, 6, 0.1)', text: '#d97706', border: '#fef3c7' }, // amber
  content: { bg: 'rgba(219, 39, 119, 0.1)', text: '#db2777', border: '#fbcfe8' } // pink
};

export default function PersonalResearchAssistant() {
  const [activeTab, setActiveTab] = useState('Saved');
  const [researchInput, setResearchInput] = useState('');
  const [category, setCategory] = useState('academic');
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const [savedResearch, setSavedResearch] = useState([]);
  
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  const [expandedCards, setExpandedCards] = useState({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (activeTab === 'Chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab, isChatting]);

  const toggleExpand = (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input. Please try Chrome or Edge.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setResearchInput(transcript);
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const handleResearch = async () => {
    if (!researchInput.trim()) return;
    setIsSearching(true);
    
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY inside .env");

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You are a Personal Research Assistant. Research the topic requested using your tools if necessary. You MUST return ONLY a valid JSON object matching exactly this structure: { "summary": "brief summary", "keyPoints": ["point 1", "point 2"], "relatedTopics": ["topic 1", "topic 2"] }. Do not wrap the JSON in markdown blocks or include any conversational text. Return the raw JSON string directly.' }]
          },
          tools: [{ googleSearch: {} }],
          contents: [
            { role: 'user', parts: [{ text: `Please research: ${researchInput}\nCategory constraint: ${category}` }] }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      let jsonText = textResponse.trim();
      // Gracefully handle if model used markdown block anyway
      if (jsonText.includes('```')) {
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonText = match[1];
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(jsonText);
        parsedResult.summary = parsedResult.summary || 'Summary unavailable.';
        parsedResult.keyPoints = Array.isArray(parsedResult.keyPoints) ? parsedResult.keyPoints : [];
        parsedResult.relatedTopics = Array.isArray(parsedResult.relatedTopics) ? parsedResult.relatedTopics : [];
      } catch (e) {
        parsedResult = {
          summary: jsonText || 'Failed to generate summary.',
          keyPoints: ['[JSON Parse Error] Raw output shown above.'],
          relatedTopics: []
        };
      }

      const newResearch = {
        id: Date.now().toString(),
        topic: researchInput.trim(),
        category,
        timestamp: new Date().toISOString(),
        summary: parsedResult.summary,
        keyPoints: parsedResult.keyPoints,
        relatedTopics: parsedResult.relatedTopics
      };

      setSavedResearch(prev => [newResearch, ...prev]);
      setResearchInput('');
      setActiveTab('Saved');

    } catch (err) {
      console.error(err);
      alert('Error performing research: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = { role: 'user', content: chatInput.trim() };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput('');
    setIsChatting(true);

    try {
      const systemContext = "You are a Research Assistant helping the user explore their previously saved research.\nContext from user's saved research:\n\n" + 
        savedResearch.map(r => `[Topic: ${r.topic} | Category: ${r.category}]\nSummary: ${r.summary}\nKey Points: ${r.keyPoints.join(', ')}`).join('\n\n');

      const geminiHistory = newHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY inside .env");

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemContext }]
          },
          contents: geminiHistory
        })
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const assistantMsg = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text response received.';

      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
      
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: '[Connection Error] ' + err.message }]);
    } finally {
      setIsChatting(false);
    }
  };

  const getKnowledgeMapWords = () => {
    const wordCounts = {};
    const skipWords = new Set(['the', 'and', 'for', 'that', 'with', 'from', 'this', 'about', 'how', 'what', 'are', 'you']);
    
    savedResearch.forEach(r => {
      const combinedText = r.topic + ' ' + (r.relatedTopics || []).join(' ');
      const words = combinedText.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2 && !skipWords.has(w));
      words.forEach(w => {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });
    
    const maxCount = Math.max(1, ...Object.values(wordCounts));
    return Object.entries(wordCounts).map(([word, count]) => ({
      word,
      count,
      weight: count / maxCount
    })).sort((a,b) => b.count - a.count);
  };

  const words = getKnowledgeMapWords();
  const totalPoints = savedResearch.reduce((acc, r) => acc + (r.keyPoints ? r.keyPoints.length : 0), 0);
  const categoriesCovered = new Set(savedResearch.map(r => r.category)).size;

  const styles = {
    container: {
      '--color-background-primary': '#ffffff',
      '--color-background-secondary': '#f9fafb',
      '--color-text-primary': '#111827',
      '--color-text-secondary': '#4b5563',
      '--color-text-tertiary': '#9ca3af',
      '--color-border-secondary': '#e5e7eb',
      '--color-border-tertiary': '#f3f4f6',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: 'var(--color-text-primary)',
      backgroundColor: 'var(--color-background-secondary)',
      minHeight: '100vh',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '40px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      boxSizing: 'border-box'
    },
    headerTitle: {
      margin: 0,
      fontSize: '28px',
      fontWeight: '700',
      letterSpacing: '-0.02em',
      color: 'var(--color-text-primary)'
    },
    inputSection: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      backgroundColor: 'var(--color-background-primary)',
      padding: '12px',
      borderRadius: '16px',
      border: '0.5px solid var(--color-border-secondary)',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
    },
    researchRow: {
      display: 'flex',
      flexDirection: 'row',
      gap: '12px',
      width: '100%',
      alignItems: 'center'
    },
    textInput: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid var(--color-border-secondary)',
      fontSize: '15px',
      outline: 'none',
      backgroundColor: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)'
    },
    select: {
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid var(--color-border-secondary)',
      fontSize: '15px',
      backgroundColor: 'var(--color-background-primary)',
      outline: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-primary)'
    },
    button: {
      padding: '12px 24px',
      borderRadius: '12px',
      backgroundColor: 'var(--color-text-primary)',
      color: '#ffffff',
      border: 'none',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      opacity: isSearching ? 0.7 : 1,
      transition: 'opacity 0.2s',
      whiteSpace: 'nowrap'
    },
    tabsContainer: {
      display: 'flex',
      gap: '32px',
      borderBottom: '1px solid var(--color-border-secondary)',
      marginBottom: '8px'
    },
    tabItem: (isActive) => ({
      padding: '12px 4px',
      cursor: 'pointer',
      borderBottom: isActive ? '2px solid var(--color-text-primary)' : '2px solid transparent',
      color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
      fontWeight: isActive ? '600' : '500',
      fontSize: '15px',
      transition: 'all 0.2s',
      marginBottom: '-1px'
    }),
    contentArea: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    },
    cardList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    },
    card: {
      backgroundColor: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: '12px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '16px'
    },
    cardTopic: {
      margin: 0,
      fontSize: '18px',
      fontWeight: '600',
      lineHeight: '1.4'
    },
    badge: (cat) => ({
      padding: '4px 12px',
      borderRadius: '9999px',
      fontSize: '13px',
      fontWeight: '600',
      backgroundColor: CATEGORY_COLORS[cat]?.bg || '#f3f4f6',
      color: CATEGORY_COLORS[cat]?.text || '#374151',
      border: `1px solid ${CATEGORY_COLORS[cat]?.border || '#e5e7eb'}`,
      textTransform: 'capitalize'
    }),
    cardSummary: {
      margin: 0,
      fontSize: '15px',
      color: 'var(--color-text-secondary)',
      lineHeight: '1.6'
    },
    expandBtn: {
      background: 'none',
      border: 'none',
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
      padding: '0px',
      fontSize: '14px',
      fontWeight: '600',
      textAlign: 'left',
      width: 'fit-content',
      textDecoration: 'underline',
      textUnderlineOffset: '4px'
    },
    keyPointsList: {
      margin: '12px 0 0 0',
      paddingLeft: '24px',
      color: 'var(--color-text-secondary)',
      fontSize: '15px',
      lineHeight: '1.6'
    },
    relatedTopicsList: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: '8px'
    },
    relatedTopicTag: {
      fontSize: '12px',
      color: 'var(--color-text-tertiary)',
      backgroundColor: 'var(--color-background-secondary)',
      padding: '4px 10px',
      borderRadius: '6px',
      border: '1px solid var(--color-border-tertiary)'
    },
    timestamp: {
      fontSize: '12px',
      color: 'var(--color-text-tertiary)',
      marginTop: '8px'
    },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 32px',
      border: '1.5px dashed var(--color-border-secondary)',
      borderRadius: '12px',
      color: 'var(--color-text-tertiary)',
      textAlign: 'center',
      gap: '16px',
      backgroundColor: 'var(--color-background-primary)'
    },
    tagCloud: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '20px',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 40px',
      backgroundColor: 'var(--color-background-primary)',
      borderRadius: '12px',
      border: '0.5px solid var(--color-border-secondary)'
    },
    cloudWord: (weight) => ({
      fontSize: `${Math.max(16, 16 + weight * 28)}px`,
      color: `rgba(17, 24, 39, ${Math.max(0.4, weight + 0.3)})`,
      fontWeight: weight > 0.6 ? '700' : '500',
      textTransform: 'lowercase',
      transition: 'all 0.2s'
    }),
    chatContainer: {
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--color-background-primary)',
      borderRadius: '12px',
      border: '0.5px solid var(--color-border-secondary)',
      height: '500px'
    },
    chatMessages: {
      flex: 1,
      overflowY: 'auto',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    },
    chatBubble: (isUser) => ({
      maxWidth: '85%',
      padding: '14px 18px',
      borderRadius: '16px',
      backgroundColor: isUser ? 'var(--color-text-primary)' : 'var(--color-background-secondary)',
      color: isUser ? '#ffffff' : 'var(--color-text-primary)',
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      borderBottomRightRadius: isUser ? '4px' : '16px',
      borderBottomLeftRadius: isUser ? '16px' : '4px',
      lineHeight: '1.6',
      fontSize: '15px'
    }),
    chatInputArea: {
      display: 'flex',
      gap: '12px',
      padding: '16px',
      borderTop: '1px solid var(--color-border-secondary)',
      backgroundColor: 'var(--color-background-primary)',
      borderBottomLeftRadius: '12px',
      borderBottomRightRadius: '12px'
    },
    chatTextInput: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid var(--color-border-secondary)',
      fontSize: '15px',
      outline: 'none',
      backgroundColor: 'var(--color-background-secondary)'
    },
    statsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '24px',
      padding: '24px',
      backgroundColor: 'var(--color-background-primary)',
      borderRadius: '12px',
      border: '0.5px solid var(--color-border-secondary)',
      marginTop: 'auto'
    },
    statItem: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      alignItems: 'center',
      textAlign: 'center'
    },
    statValue: {
      fontSize: '28px',
      fontWeight: '700',
      color: 'var(--color-text-primary)'
    },
    statLabel: {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--color-text-tertiary)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.headerTitle}>AI Research Assistant</h1>
      
      {/* Research Input Section */}
      <div style={styles.inputSection}>
        <div style={styles.researchRow}>
          <input
            type="text"
            placeholder="What would you like to research?"
            value={researchInput}
            onChange={(e) => setResearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
            style={styles.textInput}
            disabled={isSearching}
          />
          <button 
            onClick={startListening} 
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: `1px solid ${isListening ? '#f87171' : 'var(--color-border-secondary)'}`,
              backgroundColor: isListening ? '#fef2f2' : 'var(--color-background-primary)',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              color: isListening ? '#ef4444' : 'inherit'
            }}
            title="Search by Voice"
            disabled={isSearching}
          >
            {isListening ? '🎙️' : '🎤'}
          </button>
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            style={styles.select}
            disabled={isSearching}
          >
            <option value="academic">Academic</option>
            <option value="professional">Professional</option>
            <option value="personal">Personal</option>
            <option value="content">Content</option>
          </select>
          <button 
            onClick={handleResearch} 
            style={styles.button}
            disabled={isSearching}
          >
            {isSearching ? 'Researching...' : 'Research'}
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={styles.tabsContainer}>
        {['Saved', 'Knowledge Map', 'Chat'].map(tab => (
          <div 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            style={styles.tabItem(activeTab === tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div style={styles.contentArea}>
        {activeTab === 'Saved' && (
          savedResearch.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: '32px' }}>📂</div>
              <div>No research saved yet. Enter a topic above to begin!</div>
            </div>
          ) : (
            <div style={styles.cardList}>
              {savedResearch.map(card => (
                <div key={card.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <h3 style={styles.cardTopic}>{card.topic}</h3>
                    <span style={styles.badge(card.category)}>{card.category}</span>
                  </div>
                  <p style={styles.cardSummary}>{card.summary}</p>
                  
                  {card.keyPoints && card.keyPoints.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <button 
                        onClick={() => toggleExpand(card.id)}
                        style={styles.expandBtn}
                      >
                        {expandedCards[card.id] ? '- Hide' : '+ Show'} Key Points ({card.keyPoints.length})
                      </button>
                      {expandedCards[card.id] && (
                        <ul style={styles.keyPointsList}>
                          {card.keyPoints.map((point, idx) => (
                            <li key={idx} style={{ marginBottom: '8px' }}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {card.relatedTopics && card.relatedTopics.length > 0 && (
                    <div style={styles.relatedTopicsList}>
                      {card.relatedTopics.map((topic, i) => (
                         <span key={i} style={styles.relatedTopicTag}>#{topic}</span>
                      ))}
                    </div>
                  )}
                  <div style={styles.timestamp}>
                    {new Date(card.timestamp).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'Knowledge Map' && (
          <div style={styles.tagCloud}>
            {words.length === 0 ? (
              <span style={{ color: 'var(--color-text-tertiary)' }}>No data to map yet. Search for topics first.</span>
            ) : (
              words.map((w, i) => (
                <span key={i} style={styles.cloudWord(w.weight)}>
                  {w.word}
                </span>
              ))
            )}
          </div>
        )}

        {activeTab === 'Chat' && (
          <div style={styles.chatContainer}>
            <div style={styles.chatMessages}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: '40px' }}>
                  Ask questions about your saved research!
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={styles.chatBubble(msg.role === 'user')}>
                  {msg.content}
                </div>
              ))}
              {isChatting && (
                <div style={styles.chatBubble(false)}>
                  Thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={styles.chatInputArea}>
              <input
                type="text"
                placeholder="Ask about your research..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                style={styles.chatTextInput}
                disabled={isChatting}
              />
              <button onClick={handleChat} style={styles.button} disabled={isChatting || !chatInput.trim()}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{savedResearch.length}</span>
          <span style={styles.statLabel}>Topics Saved</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{totalPoints}</span>
          <span style={styles.statLabel}>Key Points</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{categoriesCovered}</span>
          <span style={styles.statLabel}>Categories</span>
        </div>
      </div>
    </div>
  );
}
