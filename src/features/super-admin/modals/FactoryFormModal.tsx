import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';

import {
  platformColors,
  platformLayout,
  platformRadius,
  platformSpacing,
  platformType,
} from '../../../theme-platform';
import { notify } from '../../../lib/alert';
import { BottomSheetModal } from '../../../components/BottomSheetModal';
import { ChipRow, InlineError, PlatformButton } from '../components';
import type { Factory, FactoryDraft, PlatformModule } from '../api';

/**
 * Add and Edit are the same form.
 *
 * The spec lists them as two modals because they are two entry points; the
 * fields, the validation and the module picker are identical, and keeping one
 * component is what stops the two drifting apart. `factory` being null is what
 * makes it an Add.
 */
export interface FactoryFormModalProps {
  visible: boolean;
  /** Null for Add; the row to edit otherwise. */
  factory: Factory | null;
  /** Module ids currently enabled — only meaningful when editing. */
  initialModuleIds: string[];
  modules: PlatformModule[];
  onClose: () => void;
  onSubmit: (draft: FactoryDraft) => Promise<void>;
}

interface FormState {
  name: string;
  location: string;
  responsiblePerson: string;
  cnicNumber: string;
  phoneNumber: string;
  employeesCount: string;
  subscriptionFee: string;
  cnicPhotoUri: string | null;
  moduleIds: string[];
}

const EMPTY: FormState = {
  name: '',
  location: '',
  responsiblePerson: '',
  cnicNumber: '',
  phoneNumber: '',
  employeesCount: '',
  subscriptionFee: '',
  cnicPhotoUri: null,
  moduleIds: [],
};

export function FactoryFormModal({
  visible,
  factory,
  initialModuleIds,
  modules,
  onClose,
  onSubmit,
}: FactoryFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed every time it opens so a cancelled edit cannot leak into the next.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setForm(
      factory
        ? {
            name: factory.name,
            location: factory.location ?? '',
            responsiblePerson: factory.responsible_person ?? '',
            cnicNumber: factory.cnic_number ?? '',
            phoneNumber: factory.phone_number ?? '',
            employeesCount: factory.employees_count?.toString() ?? '',
            subscriptionFee: factory.subscription_fee?.toString() ?? '',
            cnicPhotoUri: null,
            moduleIds: initialModuleIds,
          }
        : EMPTY,
    );
  }, [visible, factory, initialModuleIds]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pickCnic = async () => {
    // Same web caveat as PhotoTile: the browser grants unconditionally and
    // awaiting the permission first can push the file dialog outside the tap's
    // user-activation window.
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        notify('Camera access needed', 'Enable it to attach a CNIC photo.');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) set('cnicPhotoUri', result.assets[0]?.uri ?? null);
  };

  const submit = async () => {
    // Every field is required except the CNIC photo. Reported inline, never
    // through a native alert — that is the house style everywhere else.
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('Factory Name');
    if (!form.location.trim()) missing.push('Address');
    if (!form.responsiblePerson.trim()) missing.push('Responsible Person');
    if (!form.cnicNumber.trim()) missing.push('CNIC Number');
    if (!form.phoneNumber.trim()) missing.push('Phone Number');

    const fee = Number(form.subscriptionFee);
    if (!form.subscriptionFee.trim() || Number.isNaN(fee) || fee <= 0) {
      missing.push('Monthly Subscription Fee');
    }
    if (form.moduleIds.length === 0) missing.push('at least one module');

    if (missing.length > 0) {
      setError(`Still needed: ${missing.join(', ')}.`);
      return;
    }

    const employees = form.employeesCount.trim();
    const employeesCount = employees ? Number(employees) : null;
    if (employeesCount !== null && Number.isNaN(employeesCount)) {
      setError('Employees must be a number.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        location: form.location.trim(),
        responsiblePerson: form.responsiblePerson.trim(),
        cnicNumber: form.cnicNumber.trim(),
        phoneNumber: form.phoneNumber.trim(),
        employeesCount,
        subscriptionFee: fee,
        cnicPhotoUri: form.cnicPhotoUri,
        moduleIds: form.moduleIds,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof FormState,
    options: { numeric?: boolean; placeholder?: string } = {},
  ) => (
    <View style={styles.field}>
      <Text style={platformType.label}>{label}</Text>
      <TextInput
        value={form[key] as string}
        onChangeText={(text) => set(key, text as FormState[typeof key])}
        placeholder={options.placeholder}
        placeholderTextColor={platformColors.textSecondary}
        keyboardType={options.numeric ? 'number-pad' : 'default'}
        style={styles.input}
      />
    </View>
  );

  return (
    <BottomSheetModal visible={visible} onClose={onClose} avoidKeyboard>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={platformType.heading}>
            {factory ? 'Edit Factory' : 'Add Factory'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
          >
            <Feather name="x" size={20} color={platformColors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {field('Factory Name', 'name')}
          {field('Address', 'location')}
          {field('Responsible Person', 'responsiblePerson')}
          {field('CNIC Number', 'cnicNumber', { placeholder: '00000-0000000-0' })}

          <View style={styles.field}>
            <Text style={platformType.label}>CNIC Photo</Text>
            <Pressable
              accessibilityRole="button"
              onPress={pickCnic}
              style={styles.photoTile}
            >
              <Feather
                name={form.cnicPhotoUri ? 'check-circle' : 'camera'}
                size={18}
                color={
                  form.cnicPhotoUri
                    ? platformColors.accentSuccess
                    : platformColors.textSecondary
                }
              />
              <Text style={platformType.caption}>
                {form.cnicPhotoUri
                  ? 'Photo attached — uploads on save'
                  : factory?.cnic_photo_url
                    ? 'Replace the stored photo (optional)'
                    : 'Attach a CNIC photo (optional)'}
              </Text>
            </Pressable>
          </View>

          {field('Phone Number', 'phoneNumber', { numeric: true })}
          {field('Employees', 'employeesCount', {
            numeric: true,
            placeholder: 'Manually entered',
          })}
          {field('Monthly Subscription Fee', 'subscriptionFee', { numeric: true })}

          <View style={styles.field}>
            <Text style={platformType.label}>Modules</Text>
            <ChipRow
              options={modules.map((m) => ({ id: m.id, label: m.label }))}
              selected={form.moduleIds}
              onToggle={(id) =>
                set(
                  'moduleIds',
                  form.moduleIds.includes(id)
                    ? form.moduleIds.filter((m) => m !== id)
                    : [...form.moduleIds, id],
                )
              }
            />
          </View>

          <InlineError message={error} />
        </ScrollView>

        <View style={styles.footer}>
          <PlatformButton label="Cancel" tone="quiet" onPress={onClose} style={styles.flex} />
          <PlatformButton
            label={factory ? 'Save Changes' : 'Create Factory'}
            onPress={submit}
            loading={saving}
            style={styles.flex}
          />
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: platformColors.bgApp,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: platformSpacing.content,
    borderBottomWidth: platformLayout.hairline,
    borderBottomColor: platformColors.border,
  },
  body: { padding: platformSpacing.content, gap: platformSpacing.block },
  field: { gap: platformSpacing.hair + 2 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: platformRadius.card,
    borderWidth: platformLayout.hairline,
    borderColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
    color: platformColors.textPrimary,
    fontSize: 15,
  },
  photoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: platformSpacing.tight,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: platformRadius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
  },
  footer: {
    flexDirection: 'row',
    gap: platformSpacing.tight,
    padding: platformSpacing.content,
    borderTopWidth: platformLayout.hairline,
    borderTopColor: platformColors.border,
    backgroundColor: platformColors.bgSurface,
  },
  flex: { flex: 1 },
});
