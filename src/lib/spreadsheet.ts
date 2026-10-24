import Fsp from 'fs/promises'

import { JWT } from 'google-auth-library'
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet'
import { z } from 'zod'

// Google Spreadsheetを簡易ドキュメントデータベースとして扱うためのモジュール

export interface ServiceAccount {
  client_email: string
  private_key: string
}

// サービスアカウントからgoogle-spreadsheetを利用可能にする
export async function useSpreadsheetWorksheetWithServiceAccount(
  serviceAccount: ServiceAccount,
  spreadsheetId: string,
  worksheetName: string
) {
  const jwt = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
  })

  const doc = new GoogleSpreadsheet(spreadsheetId, jwt)
  await doc.loadInfo()

  const sheet = await doc.sheetsByTitle[worksheetName]
  if (!sheet) {
    throw new Error(`Sheet ${worksheetName} not found`)
  }

  return { jwt, doc, sheet }
}

// サービスアカウントファイルからgoogle-spreadsheetを利用可能にする
export async function useSpreadsheetWorksheetWithServiceAccountFile(
  filePath: string,
  spreadsheetId: string,
  worksheetName: string
) {
  const json = await Fsp.readFile(filePath, 'utf-8')
  const serviceAccount = JSON.parse(json) as ServiceAccount
  return useSpreadsheetWorksheetWithServiceAccount(serviceAccount, spreadsheetId, worksheetName)
}

// Google Spreadsheetを簡易ドキュメントデータベースにする
export function useSpreadSheetAsDocuments<T extends z.ZodRawShape>(
  sheet: GoogleSpreadsheetWorksheet,
  dataSchema: z.ZodObject<T>
) {
  // データ型
  type DataType = z.infer<typeof dataSchema>

  // 以下のスキーマと型は主にドキュメント操作をツール化する場合に利用する

  // ドキュメント(行番号キーとデータ)の構造体とその型
  const documentSchema = z.object({
    rowKey: z.number().describe('行番号キー'),
    data: dataSchema.describe('データ'),
  })
  type DocumentType = z.infer<typeof documentSchema>

  // 部分更新用の任意データ型
  const partialSchema = dataSchema.partial()
  type PartialType = z.infer<typeof partialSchema>

  // 部分更新用のドキュメント(行番号キーと部分更新データ)の構造体とその型
  const partialDocumentSchema = z.object({
    rowKey: z.number().describe('行番号キー'),
    data: partialSchema.describe('部分更新データ'),
  })
  type PartialDocumentType = z.infer<typeof partialDocumentSchema>

  // 以下はドキュメントを操作するための関数群

  // 全ドキュメントのスナップショット
  async function snapshot(): Promise<{ documents: DocumentType[]; errors: string[] }> {
    const rows = await sheet.getRows()
    const errors: string[] = []

    const documents: DocumentType[] = []
    for (const row of rows) {
      // バリデーション
      const asObject = row.toObject()
      const validation = dataSchema.safeParse(asObject)
      if (!validation.success) {
        errors.push(`#${row.rowNumber} スキーマに適合しません: ${validation.error.message}`)
        continue
      }

      documents.push({
        rowKey: row.rowNumber,
        data: validation.data,
      })
    }

    return {
      documents,
      errors,
    }
  }

  // 行番号キーによるドキュメント1件の取得
  async function get(rowKey: number): Promise<DocumentType | null> {
    const rows = await sheet.getRows({ offset: rowKey - 2, limit: 1 })
    const record = rows[0]
    if (!record) {
      return null
    }

    const asObject = record.toObject()
    const validation = dataSchema.safeParse(asObject)
    if (!validation.success) {
      throw new Error(`#${rowKey} スキーマに適合しません: ${validation.error.message}`)
    }

    return {
      rowKey: record.rowNumber,
      data: validation.data,
    }
  }

  // 行番号キーによるドキュメント1件の部分更新
  async function patch(rowKey: number, data: PartialType) {
    const rows = await sheet.getRows({ offset: rowKey - 2, limit: 1 })
    const record = rows[0]
    if (!record) {
      throw new Error(`Row ${rowKey} not found`)
    }

    const validation = partialSchema.safeParse(data)
    if (!validation.success) {
      throw new Error(`スキーマに適合しません: ${validation.error.message}: ${JSON.stringify(data)}`)
    }

    record.assign(validation.data)
    await record.save()
  }

  // 全ドキュメントの削除
  async function clear(): Promise<void> {
    const rows = await sheet.getRows()
    for (const row of rows) {
      await row.delete()
    }
  }

  // ドキュメントの追加
  async function append(data: DataType): Promise<DocumentType> {
    const validation = dataSchema.safeParse(data)
    if (!validation.success) {
      throw new Error(`スキーマに適合しません: ${validation.error.message}: ${JSON.stringify(data)}`)
    }
    const row = await sheet.addRow(data as Parameters<typeof sheet.addRow>[0])

    return {
      rowKey: row.rowNumber,
      data: validation.data,
    }
  }

  return {
    documentSchema,
    partialSchema,
    partialDocumentSchema,
    snapshot,
    get,
    update: patch,
    clear,
    append,
  }
}
