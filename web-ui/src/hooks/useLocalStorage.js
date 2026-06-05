'use client';
import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        const saved = localStorage.getItem(key);
        if (saved) setValue(JSON.parse(saved));
    }, [key]);

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);

    return [value, setValue];
}