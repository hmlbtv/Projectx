'use client';
import { useEffect } from 'react';
// After sending, the page swaps to the "sent" view; start it at the top so the confirmation is in sight.
export default function ScrollTop() { useEffect(() => { window.scrollTo(0, 0); }, []); return null; }
