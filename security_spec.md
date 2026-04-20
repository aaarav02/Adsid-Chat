# Security Specification - AdSid Chat

## Data Invariants
1. A user cannot impersonate another user (uid must match auth.uid).
2. A message must belong to a valid chat.
3. Only participants of a chat can read its messages.
4. Only participants of a chat can send messages to it.
5. Users cannot modify the `senderId` or `timestamp` of a message after creation.
6. Users can only modify the `savedBy` and `seenBy` arrays of a message to add/remove their own UID.
7. Friend requests must have a valid `fromId` (matching requester) and `toId`.
8. Profiles can only be edited by their owners.

## The "Dirty Dozen" Payloads (Attack Vectors)
1. **Identity Spoofing (Create Profile)**: Setting `uid` to someone else's UID.
2. **Identity Spoofing (Create Message)**: Setting `senderId` to another user's UID.
3. **Unauthorized Read (Chat)**: Accessing a chat where `request.auth.uid` is not in `participants`.
4. **Unauthorized Read (Messages)**: Accessing a subcollection of a chat where the user is not a participant.
5. **Unauthorized Message Injection**: Sending a message to a chat the user is not part of.
6. **Privilege Escalation (Profile)**: Attempting to update another user's profile.
7. **Bypassing Friend Request Logic**: A user accepting a friend request they sent to someone else (should only be allowed by `toId`).
8. **Malicious Content Injection**: Sending a message with an extremely large content string (Denial of Wallet).
9. **Timestamp Manipulation**: Manually setting a future `timestamp` to pin a message to the top.
10. **Shadow Key Injection**: Adding a `role: 'admin'` field to a user profile or document.
11. **Orphaned Message**: Creating a message in a non-existent chat ID.
12. **Unauthorized Deletion**: Attempting to delete a message (should be disabled or restricted).

## Test Runner (Draft)
```typescript
// firestore.rules.test.ts (Conceptual)
// This file would use @firebase/rules-unit-testing to verify the above payloads.
// Tests would ensure PERMISSION_DENIED for each "Dirty Dozen" payload.
```
