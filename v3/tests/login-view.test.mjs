import test from 'node:test'
import assert from 'node:assert/strict'
import { loginView } from '../login-view.mjs'
test('unconfigured login page cannot accept or submit credentials',()=>{
 const html=loginView()
 assert.match(html,/<fieldset disabled>/)
 assert.match(html,/Giriş henüz etkin değil/)
 assert.doesNotMatch(html,/<form|<script/)
 assert.match(html,/for="staff-email"/)
 assert.match(html,/for="staff-password"/)
})
