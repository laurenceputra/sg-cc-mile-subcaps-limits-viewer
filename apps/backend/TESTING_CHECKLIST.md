# Testing Checklist - Phase 5

## Pre-Deployment Testing Checklist

Use this checklist before deploying changes to production.

### ✅ Unit & Integration Tests
- [ ] Run `npm --prefix apps/backend test` - Workers-only tests pass
- [ ] No regressions in existing functionality

### ✅ Security Validation
- [ ] Rate limiting enforced on all endpoints
- [ ] CSRF protection active (Origin header validation)
- [ ] Input validation blocks malicious input
- [ ] SQL injection attempts blocked
- [ ] XSS attempts blocked
- [ ] Control characters rejected
- [ ] Token security verified
- [ ] Constant-time comparisons for sensitive operations

### ✅ Functional Testing
- [ ] User registration works
- [ ] User login with correct credentials works
- [ ] Failed login attempts rate limited
- [ ] Device registration and management works
- [ ] Sync upload and download works
- [ ] Version conflict detection works
- [ ] Data export works (GDPR)
- [ ] Complete data deletion works (GDPR)
- [ ] Admin endpoints secured
- [ ] Shared mappings contribution works

### ✅ Performance Testing
- [ ] Response times acceptable (<100ms for most operations)
- [ ] 100+ concurrent users handled
- [ ] No memory leaks detected
- [ ] Database queries optimized
- [ ] Rate limits don't affect legitimate users

### ✅ Data Integrity
- [ ] Atomic version checking prevents lost updates
- [ ] Concurrent writes handled correctly
- [ ] No race conditions in sync operations
- [ ] D1 writes complete successfully

### ✅ Compliance
- [ ] GDPR data deletion complete and irreversible
- [ ] Data export includes all user data
- [ ] Audit logs capture security events
- [ ] Privacy settings respected

### ✅ Configuration
- [ ] Environment variables set correctly
- [ ] JWT_SECRET is strong and secret
- [ ] ADMIN_KEY is strong and secret
- [ ] ALLOWED_ORIGINS configured
- [ ] Rate limit values appropriate

### ✅ Monitoring & Logging
- [ ] Error tracking configured
- [ ] Audit logs enabled
- [ ] Performance monitoring setup
- [ ] Alert thresholds configured

### ✅ Documentation
- [ ] API documentation updated
- [ ] Security fixes documented
- [ ] Known limitations documented
- [ ] Deployment instructions clear

## Manual Testing Scenarios

### Scenario 1: New User Registration and Sync
1. Register new account
2. Login
3. Register device
4. Upload sync data
5. Logout and login again
6. Verify sync data retrieved

**Expected**: All steps succeed, data preserved

### Scenario 2: Multi-Device Sync
1. Login from Device A
2. Upload data version 1
3. Login from Device B
4. Download data (should be version 1)
5. Device A uploads version 2
6. Device B tries to upload version 2 (should conflict)
7. Device B fetches version 2 and uploads version 3

**Expected**: Conflict detected, resolved correctly

### Scenario 3: Rate Limiting
1. Attempt 6 failed logins from same IP
2. 6th attempt should be rate limited

**Expected**: 5 attempts allowed, 6th blocked with 429

### Scenario 4: Security Attacks
1. Try SQL injection in email: `admin'--`
2. Try XSS in merchant name: `<script>alert('xss')</script>`
3. Try request from unauthorized origin
4. Try request without Origin header (production)

**Expected**: All attacks blocked with 400 or 403

### Scenario 5: GDPR Compliance
1. Create account with data
2. Export data (verify complete)
3. Delete account
4. Verify all data removed (sync, devices, contributions)

**Expected**: Complete deletion, no trace left

### Scenario 6: Admin Moderation
1. User contributes mapping
2. Admin views pending (with valid key)
3. Admin approves mapping
4. Mapping appears in shared mappings

**Expected**: Complete moderation workflow works

## Automated Test Runs

### Before Every Commit
```bash
npm --prefix apps/backend test
```

### Before Pull Request
```bash
npm --prefix apps/backend run test:workers
```

## Staging Environment Tests

### Integration Testing
1. Deploy to staging
2. Run smoke tests
3. Test with real Cloudflare D1
4. Test with real rate limiting (KV)
5. Monitor for 24 hours

### Load Testing
1. Simulate 100 concurrent users
2. Monitor response times
3. Check error rates
4. Verify rate limits work
5. Check database performance

### Security Testing
1. Run OWASP ZAP scan
2. Test penetration scenarios
3. Verify headers with SecurityHeaders.com
4. Test CSRF protection
5. Verify no information leakage

## Production Deployment Checklist

### Pre-Deployment
- [ ] All staging tests passed
- [ ] Security audit completed
- [ ] Performance acceptable
- [ ] Rollback plan prepared
- [ ] Monitoring configured

### Deployment
- [ ] Deploy during low-traffic window
- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Check audit logs
- [ ] Verify rate limiting works

### Post-Deployment
- [ ] Smoke tests pass
- [ ] Monitor for 1 hour
- [ ] Check error tracking
- [ ] Review audit logs
- [ ] User acceptance testing

### Rollback Criteria
- Error rate > 1%
- Response time > 500ms (p95)
- Security vulnerability discovered
- Data integrity issues
- Rate limiting not working

## Known Limitations

### Test Environment
- Uses in-memory SQLite (production uses D1)
- Rate limiting not distributed (production uses KV)
- No actual email sending (mocked)

### Test Suite
- 44/77 tests passing (57%)
- Some test isolation issues
- Async cleanup timing issues
- Test harness limitations (not code bugs)

### Production Differences
- D1 has higher latency than SQLite
- Distributed rate limiting behaves differently
- Cloudflare Workers environment differences

## Emergency Contacts

### On-Call Rotation
- Primary: [Your Team]
- Secondary: [Backup Team]
- Escalation: [Management]

### Issue Tracking
- Critical bugs: Immediate Slack alert
- Security issues: Security channel + email
- Performance degradation: Monitoring alerts

## Maintenance Schedule

### Daily
- Review error logs
- Check rate limit hits
- Monitor performance metrics

### Weekly
- Review audit logs
- Check for suspicious activity
- Performance trend analysis

### Monthly
- Security patch review
- Dependency updates
- Load testing
- Disaster recovery drill

---

**Last Updated**: Phase 5 Complete
**Next Review**: Before production deployment
