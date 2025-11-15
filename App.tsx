
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Part, GenerateContentResponse, Modality, Content } from "@google/genai";

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatArea from './components/ChatArea';
import ChatInput from './components/ChatInput';
import type { Message } from './types';
import { fileToBase64 } from './utils';

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export const App: React.FC = () => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  
  // Load chats from localStorage on initial render
  useEffect(() => {
    const savedChats = localStorage.getItem('pro-nex-chats');
    if (savedChats) {
        try {
            const parsedChats = JSON.parse(savedChats);
            if (Array.isArray(parsedChats) && parsedChats.length > 0) {
                setChats(parsedChats);
                setActiveChatId(parsedChats[0].id);
            } else {
                 handleNewChat();
            }
        } catch (error) {
            console.error("Failed to parse chats from localStorage", error);
            handleNewChat();
        }
    } else {
      handleNewChat();
    }
  }, []);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (chats.length > 0) {
        localStorage.setItem('pro-nex-chats', JSON.stringify(chats));
    }
  }, [chats]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChatId, chats]);

  const getActiveChatMessages = () => {
    if (!activeChatId) return [];
    return chats.find(chat => chat.id === activeChatId)?.messages || [];
  };

  const mapMessagesToHistory = (messages: Message[]): Content[] => {
    return messages.filter(m => !m.isLoading).map(message => {
        const parts: Part[] = [];
        if (message.text) {
            parts.push({ text: message.text });
        }
        if (message.sender === 'user' && message.imageBase64 && message.imageMimeType) {
            parts.push({ inlineData: { data: message.imageBase64, mimeType: message.imageMimeType } });
        } else if (message.sender === 'bot' && message.imageUrl?.startsWith('data:')) {
            const [header, data] = message.imageUrl.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            parts.push({ inlineData: { data, mimeType } });
        }
        return {
            role: message.sender === 'user' ? 'user' : 'model',
            parts: parts
        };
    }).filter(content => content.parts.length > 0);
  };

  const handleNewChat = () => {
    const newChatId = Date.now().toString();
    const newChat: ChatSession = {
        id: newChatId,
        title: "New Chat",
        messages: []
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChatId);
  };
  
  const handleSelectChat = (chatId: string) => {
      setActiveChatId(chatId);
  }

  const updateChatSession = (chatId: string, updateFn: (chat: ChatSession) => ChatSession) => {
      setChats(prev => prev.map(chat => chat.id === chatId ? updateFn(chat) : chat));
  };

  const handleSendMessage = async (text: string, image?: File) => {
    if (isLoading || !activeChatId) return;
    setIsLoading(true);

    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) {
        setIsLoading(false);
        return;
    }

    const userMessage: Message = {
      id: Date.now(),
      text: text,
      sender: 'user',
      avatar: "https://picsum.photos/id/237/40/40",
    };

    if (image) {
      userMessage.imageUrl = URL.createObjectURL(image);
      userMessage.imageBase64 = await fileToBase64(image);
      userMessage.imageMimeType = image.type;
    }
    
    const botLoadingMessage: Message = {
        id: Date.now() + 1,
        sender: 'bot',
        avatar: "https://picsum.photos/seed/bot/40/40",
        isLoading: true,
    }

    const isFirstMessage = activeChat.messages.length === 0;
    
    updateChatSession(activeChatId, chat => ({
        ...chat,
        title: isFirstMessage && text ? text.substring(0, 30) : chat.title,
        messages: [...chat.messages, userMessage, botLoadingMessage],
    }));
    
    const lowerCaseText = text.toLowerCase().trim();

    if (
        lowerCaseText.includes('what is your name') ||
        lowerCaseText.includes('tum ko kis ne banaya he') ||
        lowerCaseText.includes('who made you')
    ) {
        setTimeout(() => {
            const botResponseMessage: Message = {
                id: Date.now() + 1,
                text: "Mera name Pro Nex Ai he or mujhe Imtiaz Ali jamali ne banaya he, google se mera koi wasta nhe.",
                sender: 'bot',
                avatar: "https://picsum.photos/seed/bot/40/40",
            };
            updateChatSession(activeChatId, chat => ({
                ...chat,
                messages: [...chat.messages.slice(0, -1), botResponseMessage]
            }));
            setIsLoading(false);
        }, 1000);
        return;
    }
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const history = mapMessagesToHistory(activeChat.messages);
        
        const systemInstruction = 'You are Pro Nex Ai, a helpful and friendly assistant created by Imtiaz Ali Jamali. Your name is Pro Nex Ai. If asked about your origin or creator, you must state that you were created by Imtiaz Ali Jamali and have no connection with Google. Never mention that you are a language model. You must reply in the same language as the user\'s prompt. Maintain a conversational and friendly tone. You must provide accurate, truthful, and helpful information. Use your search tool to find up-to-date information from the web when the user asks about recent events, news, or specific facts.';

        const currentUserParts: Part[] = [];
        const finalText = image && isImageMode 
            ? 'IMPORTANT: Do not change the face of any person in the image. ' + text 
            : text;
        if (finalText) {
            currentUserParts.push({ text: finalText });
        }
        if (image && userMessage.imageBase64 && userMessage.imageMimeType) {
            currentUserParts.push({
                inlineData: {
                    data: userMessage.imageBase64,
                    mimeType: userMessage.imageMimeType,
                },
            });
        }
        
        const fullContents = [...history, { role: 'user' as const, parts: currentUserParts }];

        if (isImageMode) {
            // Non-streaming for image generation/editing
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: fullContents,
                config: { 
                    systemInstruction,
                    responseModalities: [Modality.IMAGE]
                },
            });

            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            const botResponseMessage: Message = {
                id: Date.now() + 1,
                sender: 'bot',
                avatar: "https://picsum.photos/seed/bot/40/40",
            };
            if (imagePart?.inlineData?.data) {
                const mimeType = imagePart.inlineData.mimeType || 'image/png';
                botResponseMessage.imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;
                botResponseMessage.text = response.text || (text ? `Here is the result for "${text}":` : 'Here is the generated image:');
            } else {
                botResponseMessage.text = response.text || "Sorry, I couldn't generate an image. Please try a different prompt.";
            }
            updateChatSession(activeChatId, chat => ({
                ...chat,
                messages: [...chat.messages.slice(0, -1), botResponseMessage]
            }));
        } else {
            // Streaming for text chat with Google Search grounding
            const stream = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: fullContents,
                config: { 
                    systemInstruction,
                    tools: [{googleSearch: {}}]
                }
            });
            
            let fullText = "";
            let sources: Array<{ title: string; uri: string; }> = [];
            let lastMessageUpdateTime = 0;

            for await (const chunk of stream) {
                const newText = chunk.text;
                if(newText) fullText += newText;
                
                // Throttle UI updates to avoid re-rendering on every character
                if (Date.now() - lastMessageUpdateTime > 50) {
                     updateChatSession(activeChatId, chat => {
                        const newMessages = [...chat.messages];
                        const lastMessage = newMessages[newMessages.length - 1];
                        if (lastMessage && lastMessage.sender === 'bot') {
                            lastMessage.text = fullText;
                        }
                        return { ...chat, messages: newMessages };
                    });
                    lastMessageUpdateTime = Date.now();
                }

                const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (groundingChunks) {
                    const newSources = groundingChunks
                        .map(chunk => chunk.web)
                        .filter((web): web is { uri: string; title: string; } => !!web?.uri && !!web.title)
                        .map(web => ({ uri: web.uri, title: web.title }));
                    sources.push(...newSources);
                }
            }
            
            // Final update with all text and sources
            if (activeChatId) {
                updateChatSession(activeChatId, chat => {
                    const newMessages = [...chat.messages];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.sender === 'bot') {
                        lastMessage.text = fullText;
                        const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());
                        lastMessage.sources = uniqueSources.length > 0 ? uniqueSources : undefined;
                    }
                    return { ...chat, messages: newMessages };
                });
            }
        }
    } catch (error) {
        console.error("Error generating content:", error);
         const botErrorMessage: Message = {
            id: Date.now() + 1,
            text: "Sorry, something went wrong. Please try again.",
            sender: 'bot',
            avatar: "https://picsum.photos/seed/bot/40/40",
        };
         updateChatSession(activeChatId, chat => ({
            ...chat,
            messages: [...chat.messages.slice(0, -1), botErrorMessage]
         }));
    } finally {
        // Final update to turn off loading state for both cases
        if (activeChatId) {
            updateChatSession(activeChatId, chat => {
                const newMessages = [...chat.messages];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage) {
                    lastMessage.isLoading = false;
                }
                return { ...chat, messages: newMessages };
            });
        }
        setIsLoading(false);
    }
  };


  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 antialiased">
      <Sidebar 
        onNewChat={handleNewChat} 
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
      />
      <div className="flex flex-1 flex-col h-full">
        <Header onNewChat={handleNewChat} />
        <main
          ref={scrollRef}
          className={`flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 flex flex-col ${
            getActiveChatMessages().length > 0 ? '' : 'justify-center'
          }`}
        >
          <ChatArea messages={getActiveChatMessages()} />
        </main>
        <ChatInput 
            onSendMessage={handleSendMessage} 
            isLoading={isLoading}
            isImageMode={isImageMode}
            onImageModeChange={setIsImageMode}
        />
      </div>
    </div>
  );
};
