# TODO - Development Tasks

## High Priority
- [ ] Implement a save and return feature for partially completed surveys.

## Medium Priority
- [ ] Review the introdcution text to ensure that it aligns with the latest project goals.
- [ ] Review the survey completion text for approval by the working group.

## Low Priority
- [ ] Task description here

## Completed
- [x] Task description here

## Notes
Add any additional context or implementation details here.


## Save Feature Workflow

### Already Implemented ✓
1. **Auto-save** - Answers save automatically as users type (500ms debounce)
2. **Database storage** - All answers stored with submission ID
3. **Retrieval API** - Backend endpoint to fetch saved submissions exists
4. **Offline support** - Queues saves when offline and syncs later

### What's Missing for Full Resume Support

#### Easy Changes (30-60 min)
1. **Store section progress** - Save `currentSectionIndex` to localStorage or database
2. **Load on mount** - Check for existing submission ID and restore answers + section
3. **Resume UI** - Add a "Resume Survey" button/link on landing page

#### Medium Complexity (1-2 hours)
4. **Link generation** - Create unique resume links (e.g., `/survey?id=xyz`)
5. **Session management** - Store submission ID in localStorage/sessionStorage
6. **Visual indicators** - Show which sections/questions are completed

#### Nice-to-Have (2-4 hours)
7. **Email resume links** - Allow users to email themselves a resume link
8. **Expiration logic** - Auto-delete incomplete submissions after X days
9. **Progress bar enhancement** - Show actual completion percentage

### Implementation Difficulty
**Overall: Easy to Moderate** (2-4 hours total)

The hardest part is already done - persistent storage and auto-save working. The remaining work is mostly UI/UX and state restoration log