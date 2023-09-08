import { fetch, Body } from '@tauri-apps/api/http';
import { store } from '../../../utils/store';

export async function translate(text, from, to, options = {}) {
    const { config, setResult } = options;

    let translateConfig = await store.get('openai_summary');
    if (config !== undefined) {
        translateConfig = config;
    }
    let { service, requestPath, model, apiKey, stream, systemPrompt, userPrompt } = translateConfig;

    if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    if (systemPrompt !== '') {
        systemPrompt = systemPrompt.replaceAll('$text', text).replaceAll('$from', from).replaceAll('$to', to);
    } else {
        systemPrompt = `You are a text summarizer, you can only summarize the text, don't interpret it.`;
    }
    if (userPrompt !== '') {
        userPrompt = userPrompt.replaceAll('$text', text).replaceAll('$from', from).replaceAll('$to', to);
    } else {
        userPrompt = `Summarize in ${to}:\n"""\n${text}\n"""`;
    }

    const headers =
        service === 'openai'
            ? {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
              }
            : {
                  'Content-Type': 'application/json',
                  'api-key': apiKey,
              };
    let body = {
        temperature: 0,
        stream: stream,
        top_p: 1,
        frequency_penalty: 1,
        presence_penalty: 1,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
    };
    if (service === 'openai') {
        body['model'] = model;
    }
    if (stream) {
        const res = await window.fetch(requestPath, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });
        if (res.ok) {
            let target = '';
            const reader = res.body.getReader();
            try {
                let temp = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        setResult(target.trim());
                        return target.trim();
                    }
                    const str = new TextDecoder().decode(value);
                    let datas = str.split('data:');
                    for (let data of datas) {
                        if (data.trim() !== '' && data.trim() !== '[DONE]') {
                            try {
                                if (temp !== '') {
                                    data = temp + data.trim();
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0].delta.content) {
                                        target += result.choices[0].delta.content;
                                        if (setResult) {
                                            setResult(target + '_');
                                        } else {
                                            return '[STREAM]';
                                        }
                                    }
                                    temp = '';
                                } else {
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0].delta.content) {
                                        target += result.choices[0].delta.content;
                                        if (setResult) {
                                            setResult(target + '_');
                                        } else {
                                            return '[STREAM]';
                                        }
                                    }
                                }
                            } catch {
                                temp = data.trim();
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    } else {
        let res = await fetch(requestPath, {
            method: 'POST',
            headers: headers,
            body: Body.json(body),
        });
        if (res.ok) {
            let result = res.data;
            const { choices } = result;
            if (choices) {
                let target = choices[0].message.content.trim();
                if (target) {
                    if (target.startsWith('"')) {
                        target = target.slice(1);
                    }
                    if (target.endsWith('"')) {
                        target = target.slice(0, -1);
                    }
                    return target.trim();
                } else {
                    throw JSON.stringify(choices);
                }
            } else {
                throw JSON.stringify(result);
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    }
}

export * from './Config';
export * from './info';
