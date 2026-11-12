/**
 * zod's default messages, in Portuguese (Learning Anything — shared contracts).
 *
 * This app's schemas have the important sentences written by hand, but what
 * zod generates on its own (text too long, number out of range) comes out in
 * English — and the sentence goes straight to the screen (`middleware/errors.ts`).
 * Importing this file once, at the entry of the process and of the panel, swaps the map.
 *
 */

import { z } from 'zod'

export const portugueseErrorMap: z.core.$ZodErrorMap = function map(problem) {
  switch (problem.code) {
    case 'invalid_type':
      if (problem.expected === 'int') {
        return { message: 'Use um número inteiro.' }
      }
      return { message: problem.input === undefined ? 'Campo obrigatório.' : 'Valor em formato inválido.' }
    case 'too_small':
      if (problem.origin === 'string') {
        return {
          message: problem.minimum === 1 ? 'Campo obrigatório.' : `Use pelo menos ${problem.minimum} caracteres.`,
        }
      }
      if (problem.origin === 'array') {
        return { message: `Escolha pelo menos ${problem.minimum}.` }
      }
      return { message: `O valor mínimo é ${problem.minimum}.` }
    case 'too_big':
      if (problem.origin === 'string') {
        return { message: `Use até ${problem.maximum} caracteres.` }
      }
      if (problem.origin === 'array') {
        return { message: `O máximo é ${problem.maximum} itens.` }
      }
      return { message: `O valor máximo é ${problem.maximum}.` }
    case 'invalid_value':
      return { message: 'Escolha uma das opções.' }
    case 'invalid_format':
      return { message: problem.format === 'uuid' ? 'Identificador inválido.' : 'Valor em formato inválido.' }
    case 'unrecognized_keys':
      return { message: `Campo desconhecido: ${problem.keys.join(', ')}.` }
    default:
      return undefined
  }
}

// Zod 4 does not pass defaultError to the map; the locale covers the other cases.
z.config({ ...z.locales.pt(), customError: portugueseErrorMap })
