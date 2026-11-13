/**
 * Regressions of the Portuguese validation messages after the move to Zod 4.
 */
import './zodPortuguese.js'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

describe('validation in Portuguese', function describeValidations() {
  it.each([
    [z.string(), undefined, 'Campo obrigatório.'],
    [z.number().int(), 1.5, 'Use um número inteiro.'],
    [z.string().max(2), 'abc', 'Use até 2 caracteres.'],
    [z.array(z.string()).max(1), ['a', 'b'], 'O máximo é 1 itens.'],
    [z.enum(['yes', 'no']), 'talvez', 'Escolha uma das opções.'],
    [z.object({ name: z.string() }).strict(), { name: 'Mandy', company: 'outra' }, 'Campo desconhecido: company.'],
  ] as const)('keeps the form sentence (%s)', function checkBehavior(schema, input, message) {
    const result = schema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(message)
    }
  })

  it('keeps specific messages and uses the Portuguese locale for other errors', function checkBehavior() {
    const specific = z.string().min(2, 'Informe o nome completo.').safeParse('a')
    expect(specific.error?.issues[0].message).toBe('Informe o nome completo.')
    const remaining = z.number().multipleOf(2).safeParse(3)
    expect(remaining.error?.issues[0].message).toMatch(/múltiplo/)
  })
})
