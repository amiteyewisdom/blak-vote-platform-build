# BlakVote Platform UI Refactor Guide

## Overview

This guide walks through the UI/UX improvements applied to transform the BlakVote voting platform into a clean, modern, professional interface.

---

## ✅ Components Created

### 1. **PublicHeader.tsx** (components/PublicHeader.tsx)
Clean top navigation for public pages.

**Features:**
- Logo + "BlakVote" text (mobile, hidden on smaller screens)
- Hamburger menu button (mobile only, hidden on md+)
- Desktop nav links: Home, Ticketing, Contact
- Integrates with PublicSidebar for mobile menu

**Design:**
- Sticky header with subtle border
- Consistent height (h-16)
- Backdrop blur for depth
- Mobile-first approach

### 2. **PublicSidebar.tsx** (components/PublicSidebar.tsx)
Mobile navigation sidebar with smooth animations.

**Features:**
- Slide-in from left (translateX animation)
- Backdrop overlay (click to close)
- Navigation items:
  - Home
  - Ticketing
  - Contact
- Footer section:
  - Terms & Conditions
  - Privacy Policy
- Active page highlighting
- Closes on route change

**Design:**
- Smooth 300ms transition animation
- Full viewport height minus header
- Width: 16rem (256px)
- Active states with background highlight

---

## 🔄 Components to Update

### 1. **PublicLayout.tsx** (components/PublicLayout.tsx)

**Current:**
```tsx
import React from "react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-surface-elevated text-foreground flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {children}
      </main>
    </div>
  );
}
```

**Update to:**
```tsx
'use client'

import React from "react";
import { PublicHeader } from "./PublicHeader";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--legacy-bg-base))] text-foreground flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
```

**Changes:**
- add 'use client' directive
- import PublicHeader component
- replace gradient background with solid color
- remove inner flex/padding from main (let pages handle layout)
- add PublicHeader to render tree

---

### 2. **Vote Page** (app/vote/[event_code]/page.tsx)

A refactored version is available at: `app/vote/[event_code]/page-refactored.tsx`

**Key improvements:**

#### Layout
- Removed card grid (no longer using Card component from UI kit)
- Adopted clean row-based list with soft dividers
- Expandable rows (click to expand details)

#### Header Section
```
PUBLIC VOTING (small uppercase label)
Event Title (h1)
Event Description (p)
```

#### Voting Details Section
- Compact, side-by-side layout
- Price per vote (left) | Receipt email input (right)
- No heavy borders, subtle background

#### Candidate List
- **Collapsed View:**
  - Avatar (12px) + Name (bold) + Code (muted)
  - "Vote" action button (right)
  - Chevron icon to expand
  
- **Expanded View:**
  - Biography
  - Vote selection inputs (grid layout)
  - Summary with calculated savings
  - Bulk vote packages (2-column grid)
  - All inputs and buttons follow design system

#### Design System Applied
```
Spacing: py-4 sm:py-5 (rows), gap-3 sm:gap-4
Border radius: rounded-md (0.375rem)
Borders: border-border/60, border-border/50
Hover state: hover:bg-foreground/[0.03]
Buttons: h-9, px-4, border-border/70
Inputs: h-9, px-3, rounded-md
Text: font-semibold tracking-[-0.02em] (titles)
       text-foreground/60 (muted)
       text-xs uppercase tracking-[0.12em] (labels)
```

---

## 📋 Implementation Steps

### Step 1: Update PublicLayout
1. Open `components/PublicLayout.tsx`
2. Replace content with the updated version above
3. Verify no errors in build

### Step 2: Replace Vote Page
1. Open `app/vote/[event_code]/page.tsx`
2. Copy entire content from `page-refactored.tsx`
3. Delete the `-refactored` version once confirmed working
4. Test:
   - Verify candidate rows expand/collapse
   - Check mobile responsiveness
   - Test payment flow initiation

### Step 3: Verify Design System Consistency
Across all public pages, ensure:
- [ ] Same button styling (h-9, px-4, rounded-md)
- [ ] Same spacing rhythm (py-14 sm:py-20, px-4 sm:px-6)
- [ ] Same border style (border-border/60)
- [ ] Same typography hierarchy
- [ ] Hover states are subtle

### Step 4: Test Mobile Navigation
1. Open site on mobile device or use dev tools
2. Click hamburger menu
3. Verify:
   - Sidebar slides in smoothly
   - Backdrop appears
   - Clicking backdrop closes menu
   - Active page is highlighted
   - Sidebar closes on navigation

### Step 5: Test All Breakpoints
- Mobile (375px): hamburger visible, sidebar works
- Tablet (640px): hamburger visible, sidebar works
- Desktop (768px+): desktop nav visible, hamburger hidden

---

## 🎨 Design System Reference

### Colors
- Background: `hsl(var(--legacy-bg-base))`
- Borders: `border-border/60` (muted) or `border-border/50` (subtle)
- Hover: `bg-foreground/[0.03]` (very subtle)
- Text muted: `text-foreground/60` or `text-foreground/70`
- Text labels: `text-foreground/45` or `text-foreground/55`

### Spacing
- Page top padding: `py-14 sm:py-20`
- Page horizontal padding: `px-4 sm:px-6 lg:px-8`
- Row padding: `py-4 sm:py-5`, `px-4 sm:px-6`
- Element gaps: `gap-3 sm:gap-4` or `gap-4 sm:gap-6`

### Typography
```
Heading 1:  text-3xl sm:text-4xl font-semibold tracking-[-0.02em]
Heading 2:  text-[15px] sm:text-base font-semibold tracking-[0.01em]
Body:       text-sm sm:text-base text-foreground/60 leading-relaxed
Label:      text-xs uppercase tracking-[0.12em] text-foreground/45 font-medium
Small:      text-[13px] sm:text-sm text-foreground/55
```

### Border Radius
- Small components: `rounded-md` (0.375rem)
- Large components: `rounded-lg` (0.5rem)
- Avatar: `rounded-md`
- Buttons: `rounded-md`

### Buttons
```
h-9 px-4 rounded-md border border-border/70
text-sm font-medium text-foreground/80
hover:border-foreground/30 hover:text-foreground hover:bg-foreground/[0.035]
transition-colors
disabled:opacity-60
```

### Inputs
```
h-9 px-3 rounded-md bg-transparent
border border-border/60 text-foreground
placeholder:text-foreground/40
focus:outline-none focus:border-foreground/35
text-sm transition-colors
```

---

## 🎯 Expected Results

After implementation, the platform will feature:

1. **Professional Navigation**
   - Clean header with logo
   - Mobile hamburger menu with smooth animations
   - Desktop navigation for larger screens
   - Active page indicators

2. **Consistent Design Language**
   - Same button style everywhere
   - Same spacing and alignment
   - No heavy shadows or card overlays
   - Clean, minimal aesthetic

3. **Improved UX**
   - Expandable rows instead of cards (less visual clutter)
   - Better touch targets on mobile
   - Smooth interactions
   - Clear information hierarchy

4. **Mobile-First Approach**
   - All elements scale properly
   - Touch-friendly buttons (h-9 = 36px)
   - Responsive grid layouts (1 to 2 columns)
   - Accessible sidebar navigation

---

## 📱 Responsive Breakpoints

- **Mobile (< 640px):** Hamburger menu visible, single column layouts
- **Tablet (640px - 1024px):** Hamburger still visible, 2-column layouts
- **Desktop (1024px+):** Desktop nav visible, 3-column layouts where applicable

---

## ✨ Next Phase (Optional)

Additional refinements for a "premium" feel:

1. **Animations:**
   - Smooth page transitions
   - Button press feedback
   - Loading skeleton screens

2. **Dark Mode:**
   - Already built into existing color system
   - No additional work needed

3. **Accessibility:**
   - Add aria-labels to interactive elements
   - Test keyboard navigation
   - Verify color contrast ratios

4. **Performance:**
   - Code split PublicHeader/Sidebar rendering
   - Lazy load candidate images
   - Optimize bundle size

---

## 📞 Support

If tables/grids need different styling or additional components arise, apply the same principles:
- Minimal borders (border-border/60)
- Soft hover states
- Consistent spacing
- Clean typography
