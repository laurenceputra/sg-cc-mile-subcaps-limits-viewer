# Code Review Guidelines

## Focus Areas
- Logic errors and bugs
- Security vulnerabilities
- Performance issues
- Error handling
- Architectural concerns
- Testability gaps
- Repository constraints (no external API calls, no localStorage, no sensitive logging)

## Review Checklist
- [ ] Code readability and maintainability
- [ ] Naming conventions are clear
- [ ] Complex logic has comments
- [ ] No duplicate code
- [ ] Edge cases and error paths covered
- [ ] Tests added/updated and meaningful
- [ ] Financial calculations handle zero/negative values
- [ ] Privacy/security requirements honored
- [ ] Test Anti-Pattern Check completed for backend worker tests (`NO_IMPL_DETAIL_ASSERT`, `NO_EXACT_CSP_EQUALITY`, `REQUIRE_SETUP_STATUS_ASSERT`, `NO_WEAK_TOKEN_ASSERT`, `REQUIRE_MIDDLEWARE_NEXT_ASSERT`, `NO_DUPLICATE_SECURITY_SCENARIO`)

## Output Template
### Summary
Brief overview and general assessment.

### Critical Issues
List blocking issues with locations and suggested fixes.

### Suggestions
Optional improvements and alternatives.

### Testing
List tests run or required.

### Test Anti-Pattern Check
Pass/fail with evidence (rule ID + file:line).
