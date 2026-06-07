import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

// Max file sizes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

export default function MediaPicker({ eventId, onMediaSent, senderName, senderRole, disabled }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState(null);

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission requise',
        'L\'accès à la galerie est nécessaire pour envoyer des médias.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const pickMedia = async (type) => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    const options = {
      mediaTypes: type === 'image'
        ? ['images']
        : ['videos'],
      quality: type === 'image' ? 0.7 : 0.5,
      allowsEditing: type === 'image',
      ...(type === 'video' ? { videoMaxDuration: 60 } : {}),
    };

    const result = await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      
      // Check file size
      if (asset.fileSize) {
        const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
        if (asset.fileSize > maxSize) {
          const maxMB = Math.round(maxSize / (1024 * 1024));
          Alert.alert('Fichier trop volumineux', `La taille maximale est de ${maxMB} MB.`);
          return;
        }
      }

      await uploadMedia(asset, type);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      await uploadMedia(result.assets[0], 'image');
    }
  };

  // Upload binary via XMLHttpRequest (works reliably in Expo Go)
  const uploadToPresignedUrl = (presignedUrl, fileUri, contentType) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Read file as blob
        const response = await fetch(fileUri);
        const blob = await response.blob();

        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        // Some S3-compatible services (like B2) require Content-Length
        if (blob.size) {
          xhr.setRequestHeader('Content-Length', String(blob.size));
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, body: xhr.responseText });
          } else if (xhr.status === 403) {
            reject(new Error(
              'Accès refusé au stockage (403). ' +
              'Vérifiez la configuration B2 (clé API, CORS, capacités du bucket).'
            ));
          } else {
            reject(new Error(`Échec de l'upload (HTTP ${xhr.status}): ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Erreur réseau lors de l\'upload'));
        };

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = 0.2 + (event.loaded / event.total) * 0.6;
            setUploadProgress(progress);
          }
        };

        xhr.send(blob);
      } catch (err) {
        reject(err);
      }
    });
  };

  const uploadMedia = async (asset, mediaType) => {
    setUploading(true);
    setUploadProgress(0);
    setPreview(asset.uri);

    try {
      // 1. Get presigned URL from Edge Function
      const fileName = `chat/${eventId}/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${
        mediaType === 'image' ? 'jpg' : 'mp4'
      }`;
      
      const contentType = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';

      const { data: uploadData, error: fnError } = await supabase.functions.invoke('b2-upload-url', {
        body: { eventId, fileName, contentType },
      });

      if (fnError || !uploadData?.uploadUrl) {
        throw new Error(fnError?.message || 'Impossible d\'obtenir l\'URL d\'upload');
      }

      setUploadProgress(0.2);

      // 2. Upload file to B2 via presigned URL using XMLHttpRequest
      await uploadToPresignedUrl(uploadData.uploadUrl, asset.uri, contentType);

      setUploadProgress(0.8);

      // 3. Construct the public URL via ImageKit
      const mediaUrl = uploadData.publicUrl;
      
      // Generate thumbnail URL for images/videos via ImageKit transformations
      let thumbnailUrl = null;
      if (mediaUrl && mediaUrl.includes('ik.imagekit.io')) {
        thumbnailUrl = mediaType === 'image'
          ? `${mediaUrl}?tr=w-400,h-400,q-60`
          : `${mediaUrl}/ik-thumbnail.jpg?tr=w-300,h-200`;
      } else {
        thumbnailUrl = mediaUrl;
      }

      setUploadProgress(1);

      // 4. Notify parent to send the message
      if (onMediaSent) {
        await onMediaSent(mediaUrl, mediaType, thumbnailUrl);
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Erreur d\'upload', error.message || 'Impossible d\'envoyer le média.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setPreview(null);
    }
  };

  const showOptions = () => {
    Alert.alert(
      'Envoyer un média',
      'Choisissez une option',
      [
        { text: 'Photo (Galerie)', onPress: () => pickMedia('image') },
        { text: 'Vidéo (Galerie)', onPress: () => pickMedia('video') },
        { text: 'Prendre une photo', onPress: takePhoto },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  if (uploading) {
    return (
      <View style={styles.uploadingWrap}>
        {preview && (
          <Image source={{ uri: preview }} style={styles.previewThumb} />
        )}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]} />
        </View>
        <Text style={styles.uploadingText}>
          {uploadProgress < 0.5 ? 'Préparation…' : uploadProgress < 0.8 ? 'Envoi…' : 'Finalisation…'}
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.mediaBtn, disabled && styles.mediaBtnDisabled]}
      onPress={showOptions}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons
        name="image-outline"
        size={22}
        color={disabled ? colors.textDim : colors.blue}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  mediaBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bluePale,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  mediaBtnDisabled: {
    opacity: 0.4,
  },

  // Upload progress
  uploadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    marginRight: 6,
    gap: 8,
  },
  previewThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.blue,
    borderRadius: 2,
  },
  uploadingText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
