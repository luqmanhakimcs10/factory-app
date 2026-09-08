import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddExpenseScreen } from '../features/accountant/expenses/AddExpenseScreen';
import { BillDetailScreen } from '../features/accountant/bills/BillDetailScreen';
import { ExpenseDetailScreen } from '../features/accountant/expenses/ExpenseDetailScreen';
import { InvoiceDetailScreen } from '../features/accountant/invoices/InvoiceDetailScreen';
import { LedgersScreen } from '../features/accountant/ledgers/LedgersScreen';
import { LoanDetailScreen } from '../features/accountant/loans/LoanDetailScreen';
import { PayBillScreen } from '../features/accountant/bills/PayBillScreen';
import { PaySalaryScreen } from '../features/accountant/salary/PaySalaryScreen';
import { RecordPaymentScreen } from '../features/accountant/invoices/RecordPaymentScreen';
import { SalaryDetailScreen } from '../features/accountant/salary/SalaryDetailScreen';

/**
 * Accountant: the money hub.
 *
 * The root is one screen with six in-screen tabs (Receivables, Payables,
 * Salary, Loans, Expenses, Stats); every detail and action screen is a route on
 * this stack.
 *
 * Two screens here deliberately have no action at all — Loan Detail and Expense
 * Detail. Recording a loan and approving an expense belong to Company Admin,
 * and the database enforces that: this role has no write grant on `loans` or
 * `loan_history`, and insert-but-not-update on `expenses`. The approve/reject
 * buttons live in that module's Approvals inbox, not here.
 *
 * Its place in the order lifecycle: an order becomes an invoice once it has
 * been **delivered** — `orders.stage = 'delivery'` with a `delivered_at`, both
 * written by `mark_delivered`. Production-readiness is no longer enough: a
 * finished order still owes nothing until it reaches the client. Bills are
 * `purchase_orders` at `confirmed`, and nothing earlier is even readable by
 * this role.
 */
export type AccountantStackParamList = {
  Ledgers: undefined;

  InvoiceDetail: { orderId: string };
  RecordPayment: { orderId: string };

  BillDetail: { purchaseOrderId: string };
  PayBill: { purchaseOrderId: string };

  SalaryDetail: { salaryRecordId: string };
  PaySalary: { salaryRecordId: string };

  LoanDetail: { loanId: string };

  AddExpense: undefined;
  ExpenseDetail: { expenseId: string };
};

const Stack = createNativeStackNavigator<AccountantStackParamList>();

export function AccountantStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Ledgers" component={LedgersScreen} />

      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="RecordPayment" component={RecordPaymentScreen} />

      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="PayBill" component={PayBillScreen} />

      <Stack.Screen name="SalaryDetail" component={SalaryDetailScreen} />
      <Stack.Screen name="PaySalary" component={PaySalaryScreen} />

      <Stack.Screen name="LoanDetail" component={LoanDetailScreen} />

      <Stack.Screen name="AddExpense" component={AddExpenseScreen} />
      <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
    </Stack.Navigator>
  );
}
